import type { AdapterConfig, CommandAdapterConfig, HttpAdapterConfig } from "./config.ts";

/** What a turn knows about itself; passed to the engine so it can name the turn in reports. */
export interface TurnContext {
  engine: string;
  turn: string;
}

/** Longest reply kept from an engine; the rest is cut so one turn cannot flood the log. */
export const MAX_REPLY_CHARS = 64_000;

/** Run one prompt through an engine and resolve with its reply. Rejects on failure. */
export function runTurn(adapter: AdapterConfig, prompt: string, ctx: TurnContext): Promise<string> {
  switch (adapter.kind) {
    case "echo":
      return runEcho(prompt, adapter.delayMs ?? 0);
    case "command":
      return runCommand(adapter, prompt, ctx);
    case "http":
      return runHttp(adapter, prompt, ctx);
  }
}

/** Whether the engine can run at all right now, as far as GlassEngine can tell without a turn. */
export function adapterProblem(adapter: AdapterConfig): string | null {
  if (adapter.kind !== "command") return null;
  const program = adapter.command[0] ?? "";
  return Bun.which(program) ? null : `"${program}" was not found on PATH`;
}

async function runEcho(prompt: string, delayMs: number): Promise<string> {
  if (delayMs > 0) await Bun.sleep(delayMs);
  return `echo: ${prompt}`;
}

function clip(text: string): string {
  return text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS)}\n[cut]` : text;
}

/** The environment a command engine runs with: GlassEngine's own token never goes along. */
function commandEnv(adapter: CommandAdapterConfig, ctx: TurnContext): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "GLASSENGINE_TOKEN") env[k] = v;
  }
  return { ...env, ...adapter.env, GLASSENGINE_ENGINE: ctx.engine, GLASSENGINE_TURN: ctx.turn };
}

async function runCommand(
  adapter: CommandAdapterConfig,
  prompt: string,
  ctx: TurnContext,
): Promise<string> {
  const argv = adapter.prompt === "argument" ? [...adapter.command, prompt] : adapter.command;
  const proc = Bun.spawn(argv, {
    cwd: adapter.cwd,
    env: commandEnv(adapter, ctx),
    stdin: adapter.prompt === "stdin" ? new TextEncoder().encode(prompt) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, adapter.timeoutSeconds * 1000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (timedOut)
      throw new Error(`no reply within ${adapter.timeoutSeconds}s; the run was stopped`);
    if (code !== 0) {
      const detail = stderr.trim().slice(-2000) || stdout.trim().slice(-2000);
      throw new Error(`exited with code ${code}${detail ? `: ${detail}` : ""}`);
    }
    return clip(stdout.trim());
  } finally {
    clearTimeout(timer);
  }
}

async function runHttp(
  adapter: HttpAdapterConfig,
  prompt: string,
  ctx: TurnContext,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/plain",
    ...adapter.headers,
  };
  if (adapter.tokenEnv) {
    const token = process.env[adapter.tokenEnv];
    if (!token) throw new Error(`environment variable ${adapter.tokenEnv} is not set`);
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(adapter.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, engine: ctx.engine, turn: ctx.turn }),
    signal: AbortSignal.timeout(adapter.timeoutSeconds * 1000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 2000)}` : ""}`);
  if (!(res.headers.get("content-type") ?? "").includes("json")) return clip(body.trim());
  const json = JSON.parse(body) as unknown;
  const field =
    json && typeof json === "object"
      ? (json as Record<string, unknown>)[adapter.replyField]
      : undefined;
  if (typeof field === "string") return clip(field);
  return clip(JSON.stringify(field ?? json));
}
