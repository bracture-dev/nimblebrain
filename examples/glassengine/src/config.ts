import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as z from "zod";

/**
 * Engines that run a program or call an endpoint live only in this file, which
 * the person edits by hand. No tool can add, change or remove one, so nothing
 * that reaches GlassEngine over MCP can choose a command to run. Agents that
 * join from their own session (the platform tabs) need no entry here.
 */

/** The platform tabs. An agent joining from its own session names one of these. */
export const PLATFORMS = ["claude", "codex", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

const policyOverrides = z
  .object({
    agentsMaySend: z.boolean(),
    agentsMayRead: z.boolean(),
    joinedMayChangePolicy: z.boolean(),
  })
  .partial()
  .strict();

const echoAdapter = z
  .object({
    kind: z.literal("echo"),
    /** Wait this long before replying, to show a busy engine on screen. */
    delayMs: z.number().int().min(0).max(60_000).optional(),
  })
  .strict();

const commandAdapter = z
  .object({
    kind: z.literal("command"),
    /** The program and its arguments. Run directly, never through a shell. */
    command: z.array(z.string().min(1)).min(1),
    /** Where the prompt goes: on stdin, or appended as the last argument. */
    prompt: z.enum(["stdin", "argument"]).default("stdin"),
    /** Working folder. Relative paths resolve against the config file; `~/` is your home. */
    cwd: z.string().optional(),
    /** Extra environment variables for this engine. */
    env: z.record(z.string(), z.string()).optional(),
    timeoutSeconds: z.number().int().min(1).max(3600).default(600),
  })
  .strict();

const httpAdapter = z
  .object({
    kind: z.literal("http"),
    /** A local endpoint that receives `POST {"prompt", "engine", "turn"}` as JSON. */
    url: z.url({ protocol: /^https?$/, hostname: /^(127\.0\.0\.1|localhost|\[::1\])$/ }),
    headers: z.record(z.string(), z.string()).optional(),
    /** Name of an environment variable holding a bearer token for this endpoint. */
    tokenEnv: z.string().optional(),
    /** Field of a JSON response that holds the reply. A text response is the reply as is. */
    replyField: z.string().default("reply"),
    timeoutSeconds: z.number().int().min(1).max(3600).default(600),
  })
  .strict();

const adapter = z.discriminatedUnion("kind", [echoAdapter, commandAdapter, httpAdapter]);

const engine = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "use lowercase letters, digits and hyphens"),
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional(),
    adapter,
    /** Starting switches. Changes made on screen are kept in the data folder and win over this. */
    policy: policyOverrides.optional(),
  })
  .strict();

const configSchema = z
  .object({
    $schema: z.string().optional(),
    /** Seconds a joined session stays live after its last wait. */
    leaseSeconds: z.number().int().min(10).max(3600).default(120),
    engines: z.array(engine).default([]),
  })
  .strict();

export type EngineConfig = z.output<typeof engine>;
export type AdapterConfig = z.output<typeof adapter>;
export type CommandAdapterConfig = z.output<typeof commandAdapter>;
export type HttpAdapterConfig = z.output<typeof httpAdapter>;
export type GlassConfig = z.output<typeof configSchema>;

/** Parse and check a config object; relative `cwd` values resolve against `baseDir`. */
export function parseConfig(raw: unknown, baseDir: string): GlassConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid GlassEngine config:\n${z.prettifyError(parsed.error)}`);
  }
  const seen = new Set<string>();
  for (const e of parsed.data.engines) {
    if ((PLATFORMS as readonly string[]).includes(e.id)) {
      throw new Error(`Invalid GlassEngine config: "${e.id}" is a platform tab; pick another id`);
    }
    if (seen.has(e.id)) throw new Error(`Invalid GlassEngine config: engine id "${e.id}" repeats`);
    seen.add(e.id);
    if (e.adapter.kind === "command" && e.adapter.cwd) {
      e.adapter.cwd = resolveCwd(e.adapter.cwd, baseDir);
    }
  }
  return parsed.data;
}

function resolveCwd(cwd: string, baseDir: string): string {
  if (cwd === "~") return homedir();
  if (cwd.startsWith("~/")) return join(homedir(), cwd.slice(2));
  return isAbsolute(cwd) ? cwd : resolve(baseDir, cwd);
}

export function loadConfig(path: string): GlassConfig {
  if (!existsSync(path)) throw new Error(`GlassEngine config not found: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseConfig(raw, dirname(path));
}
