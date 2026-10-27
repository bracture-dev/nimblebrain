import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { PLATFORMS } from "./config.ts";
import type { Glass, Result } from "./glass.ts";
import type { Entry } from "./store.ts";

export const UI_URI = "ui://glassengine/main";
/** The MCP Apps MIME type for a `ui://` view. */
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
/** Tools only the GlassEngine screen calls; NimbleBrain keeps them out of every agent's tool list. */
const APP_ONLY = { ui: { visibility: ["app"] } };
/** Tools for agents, not the screen. */
const AGENT_ONLY = { ui: { visibility: ["model"] } };
const VERSION = "0.2.0";
/** A wait returns by this many seconds, so no client times out on it. */
export const MAX_WAIT_SECONDS = 50;

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function answer<T>(
  r: Result<T>,
  summary: (v: T) => string,
  wrap: (v: T) => Record<string, unknown>,
): ToolResult {
  if (!r.ok) return { content: [{ type: "text", text: r.reason }], isError: true };
  return { content: [{ type: "text", text: summary(r.value) }], structuredContent: wrap(r.value) };
}

/**
 * A screen tool's result. `@nimblebrain/synapse` reads a view's data from the
 * first text block, so that block is the JSON itself.
 */
function forApp<T>(r: Result<T>, wrap: (v: T) => Record<string, unknown>): ToolResult {
  if (!r.ok) return { content: [{ type: "text", text: r.reason }], isError: true };
  const data = wrap(r.value);
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

const lines = (rows: Entry[]) =>
  rows
    .map(
      (e) => `${e.at} [${e.tab}] ${e.from} ${e.kind}${e.state ? ` (${e.state})` : ""}: ${e.text}`,
    )
    .join("\n") || "No messages.";

const tabId = z
  .string()
  .describe("The tab's id, as list_tabs shows it: claude, codex, other, or a configured engine.");
const session = z.string().describe("The session id join returned.");
const text = z.string().min(1).max(20_000);
const policyKey = z.enum(["agentsMaySend", "agentsMayRead", "joinedMayChangePolicy"]);
const since = z
  .string()
  .optional()
  .describe("Only lines after this ISO timestamp (a line's `at`).");

/**
 * The door a coding agent uses: join a platform tab, wait for messages, reply.
 * It reaches only its own tab's chat, status and (when the person allows it)
 * its own tab's switches.
 */
export function buildAgentServer(glass: Glass): McpServer {
  const server = new McpServer(
    { name: "glassengine", version: VERSION },
    {
      instructions:
        "GlassEngine shows you as a chat tab inside the person's NimbleBrain. To join: call join with your platform " +
        `(${PLATFORMS.join(", ")}). Then loop: call wait_for_message with your session; it returns within ${MAX_WAIT_SECONDS} seconds ` +
        "with messages or with 'no message yet'. Answer each message with reply, then call wait_for_message again. " +
        "Messages come from the person (typing in the tab) and from NimbleBrain's agent. Keep looping until the person " +
        "says stop or a call says your session is no longer joined. set_status shows what you are doing; release leaves the tab.",
    },
  );

  server.registerTool(
    "join",
    {
      title: "Join a GlassEngine tab",
      description:
        "Join the tab for your platform. Only one session per platform may be joined at a time; if another is live, the call is refused until the person presses Hand over or that session lapses.",
      inputSchema: z.object({
        platform: z
          .enum(PLATFORMS)
          .describe("claude for Claude Code, codex for Codex, other for any other agent."),
        client: z
          .string()
          .max(80)
          .optional()
          .describe("A short name for this session, shown in the tab."),
      }),
    },
    async ({ platform, client }) =>
      answer(
        glass.join(platform, client),
        (j) =>
          `Joined the ${j.tab} tab. Your session is ${j.session}. Now call wait_for_message with this session, ` +
          "answer each message with reply, and call wait_for_message again. Keep going until told to stop." +
          (j.pending ? ` ${j.pending} message(s) are waiting for you.` : ""),
        (j) => ({ ...j }),
      ),
  );

  server.registerTool(
    "wait_for_message",
    {
      title: "Wait for the next message",
      description: `Wait for messages in your tab. Returns within ${MAX_WAIT_SECONDS} seconds with the messages, or with no messages; either way, call it again after you answer. Each call keeps your session live.`,
      inputSchema: z.object({
        session,
        timeoutSeconds: z.number().min(0).max(MAX_WAIT_SECONDS).default(45),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ session, timeoutSeconds }, ctx) =>
      answer(
        await glass.wait(session, timeoutSeconds, ctx.mcpReq.signal),
        (w) =>
          w.messages.length > 0
            ? `${w.messages.map((m) => `From ${m.from === "person" ? "the person" : "NimbleBrain's agent"}: ${m.text}`).join("\n\n")}\n\nAnswer with reply, then call wait_for_message again.`
            : `No message yet${w.paused ? " (the person paused this tab; messages are held)" : ""}. Call wait_for_message again with the same session.`,
        (w) => ({ ...w }),
      ),
  );

  server.registerTool(
    "reply",
    {
      title: "Reply in your tab",
      description: "Write into your tab's chat. The person and NimbleBrain's agent both see it.",
      inputSchema: z.object({ session, text }),
    },
    async ({ session, text }) =>
      answer(
        glass.reply(session, text),
        () => "Shown in the tab. Call wait_for_message again.",
        (e) => ({ entry: e }),
      ),
  );

  server.registerTool(
    "set_status",
    {
      title: "Set your status",
      description: "Say what you are doing now. It shows on your tab and in its chat.",
      inputSchema: z.object({
        session,
        state: z.enum(["working", "waiting", "done", "blocked"]),
        note: z.string().max(2000).optional(),
      }),
    },
    async ({ session, state, note }) =>
      answer(
        glass.setStatus(session, state, note),
        (e) => `Status: ${e.state}.`,
        (e) => ({ entry: e }),
      ),
  );

  server.registerTool(
    "read_transcript",
    {
      title: "Read your tab's chat",
      description: "Read your own tab's chat, oldest first.",
      inputSchema: z.object({
        session,
        limit: z.number().int().min(1).max(200).default(30),
        since,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ session, limit, since }) =>
      answer(glass.sessionTranscript(session, limit, since), lines, (rows) => ({
        transcript: rows,
      })),
  );

  server.registerTool(
    "release",
    {
      title: "Leave the tab",
      description: "End your session. The tab is free for the next session of your platform.",
      inputSchema: z.object({ session }),
    },
    async ({ session }) =>
      answer(
        glass.release(session),
        (t) => `Left the ${t.name} tab.`,
        (t) => ({ tab: t }),
      ),
  );

  server.registerTool(
    "set_policy",
    {
      title: "Change your tab's switches",
      description:
        "Change one switch on your own tab. Refused unless the person has switched on joinedMayChangePolicy for your tab.",
      inputSchema: z.object({ session, key: policyKey, value: z.boolean() }),
    },
    async ({ session, key, value }) =>
      answer(
        glass.setOwnPolicy(session, key, value),
        (t) => `${key} is now ${t.policy[key] ? "on" : "off"}.`,
        (t) => ({ tab: t }),
      ),
  );

  return server;
}

/**
 * The door NimbleBrain uses, with the token from the connector entry. Its
 * agent lists tabs, reads transcripts and posts into a chat; the screen's own
 * tools (send box, pause, release, hand over, switches) are app-only, so
 * NimbleBrain keeps them out of every agent's tool list.
 */
export function buildHostServer(glass: Glass, uiHtml: () => Promise<string>): McpServer {
  const server = new McpServer(
    { name: "glassengine", version: VERSION },
    {
      instructions:
        "GlassEngine shows the person's own coding agents (Claude Code, Codex, others) as chat tabs, one per platform, " +
        "plus any engines from its config file. list_tabs shows who is joined. read_transcript reads a tab's chat; " +
        "send_message posts into it, and a joined agent receives it on its next wait and answers in the same chat. " +
        "The person sets each tab's switches on the GlassEngine screen; a refused call says which switch refused it.",
    },
  );

  server.registerResource(
    "GlassEngine",
    UI_URI,
    {
      mimeType: MCP_APP_MIME_TYPE,
      description: "One chat tab per platform and engine: status, switches, send box.",
    },
    async () => ({
      contents: [{ uri: UI_URI, mimeType: MCP_APP_MIME_TYPE, text: await uiHtml() }],
    }),
  );

  server.registerTool(
    "list_tabs",
    {
      title: "List GlassEngine tabs",
      description:
        "Each tab: who is joined, status (live, away, not joined; or idle, busy, unavailable for a configured engine), paused, messages held, and switches.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const tabs = glass.tabs();
      const text = tabs
        .map(
          (t) =>
            `${t.id} (${t.kind}): ${t.status}${t.paused ? ", paused" : ""}${t.pending ? `, ${t.pending} held` : ""}`,
        )
        .join("\n");
      return { content: [{ type: "text", text }], structuredContent: { tabs } };
    },
  );

  server.registerTool(
    "read_transcript",
    {
      title: "Read a tab's chat",
      description: "Read a tab's chat, oldest first. Omit tab for every tab agents may read.",
      inputSchema: z.object({
        tab: tabId.optional(),
        limit: z.number().int().min(1).max(200).default(30),
        since,
      }),
      annotations: { readOnlyHint: true },
      _meta: AGENT_ONLY,
    },
    async ({ tab, limit, since }) =>
      answer(glass.transcript(tab, limit, since), lines, (rows) => ({ transcript: rows })),
  );

  server.registerTool(
    "send_message",
    {
      title: "Post into a tab's chat",
      description:
        "Post a message into a tab, as NimbleBrain's agent. A joined agent gets it on its next wait and answers in the same chat; read it back with read_transcript. A configured engine runs it at once.",
      inputSchema: z.object({
        tab: tabId,
        text,
        waitSeconds: z
          .number()
          .int()
          .min(0)
          .max(MAX_WAIT_SECONDS)
          .default(30)
          .describe("For a configured engine: how long to wait for its reply."),
      }),
      _meta: AGENT_ONLY,
    },
    async ({ tab, text, waitSeconds }) =>
      answer(
        await glass.send(tab, text, "nimblebrain", waitSeconds),
        (s) =>
          s.reply !== undefined
            ? s.reply
            : s.error !== undefined
              ? `Failed: ${s.error}`
              : `Posted (${s.delivery}).`,
        (s) => ({ ...s }),
      ),
  );

  server.registerTool(
    "pause",
    {
      title: "Pause a tab",
      description: "Hold messages for the tab's joined agent until it is resumed.",
      inputSchema: z.object({ tab: tabId }),
    },
    async ({ tab }) => forApp(glass.pause(tab), (t) => ({ tab: t })),
  );

  server.registerTool(
    "resume",
    {
      title: "Resume a tab",
      description: "Deliver held messages again.",
      inputSchema: z.object({ tab: tabId }),
    },
    async ({ tab }) => forApp(glass.resume(tab), (t) => ({ tab: t })),
  );

  server.registerTool(
    "get_glass",
    {
      title: "Read the GlassEngine screen",
      description: "Everything the GlassEngine screen shows: tabs, switches and recent chat.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(500).default(300) }),
      annotations: { readOnlyHint: true },
      _meta: APP_ONLY,
    },
    async ({ limit }) =>
      forApp({ ok: true, value: glass.snapshot(limit) }, (snap) => ({ ...snap })),
  );

  server.registerTool(
    "person_send",
    {
      title: "Send from the GlassEngine screen",
      description: "The send box: the person writes into a tab.",
      inputSchema: z.object({ tab: tabId, text }),
      _meta: APP_ONLY,
    },
    async ({ tab, text }) => forApp(await glass.send(tab, text, "person"), (s) => ({ ...s })),
  );

  server.registerTool(
    "release_tab",
    {
      title: "Release a tab's session",
      description: "The Release button: end the joined session.",
      inputSchema: z.object({ tab: tabId }),
      _meta: APP_ONLY,
    },
    async ({ tab }) => forApp(glass.releaseTab(tab), (t) => ({ tab: t })),
  );

  server.registerTool(
    "hand_over",
    {
      title: "Hand a tab over",
      description:
        "The Hand over button: end the joined session so the next session of that platform can join.",
      inputSchema: z.object({ tab: tabId }),
      _meta: APP_ONLY,
    },
    async ({ tab }) => forApp(glass.handOver(tab), (t) => ({ tab: t })),
  );

  server.registerTool(
    "set_policy",
    {
      title: "Flip a switch",
      description:
        "A switch on the GlassEngine screen: agentsMaySend, agentsMayRead or joinedMayChangePolicy.",
      inputSchema: z.object({ tab: tabId, key: policyKey, value: z.boolean() }),
      _meta: APP_ONLY,
    },
    async ({ tab, key, value }) => forApp(glass.setPolicy(tab, key, value), (t) => ({ tab: t })),
  );

  return server;
}

export interface HttpOptions {
  glass: Glass;
  uiHtml: () => Promise<string>;
  port: number;
  /** NimbleBrain sends `Authorization: Bearer <token>` and gets the host door; a client without it gets the agent door. */
  token: string;
}

export interface Running {
  url: string;
  /** Tell open views to re-read: the glass changed. */
  changed(): void;
  stop(): Promise<void>;
}

/** Serve MCP at `http://127.0.0.1:<port>/mcp` and a health check at `/health`. */
export function serve(opts: HttpOptions): Running {
  const expected = `Bearer ${opts.token}`;
  const handler = createMcpHandler(({ requestInfo }) =>
    requestInfo?.headers.get("authorization") === expected
      ? buildHostServer(opts.glass, opts.uiHtml)
      : buildAgentServer(opts.glass),
  );
  const http = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    idleTimeout: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/health") {
        return Response.json({
          ok: true,
          name: "glassengine",
          version: VERSION,
          tabs: opts.glass.tabs().length,
        });
      }
      if (path !== "/mcp") return new Response("Not found", { status: 404 });
      const auth = req.headers.get("authorization");
      if (auth !== null && auth !== expected) {
        return Response.json(
          { error: "Unknown token: use the one from the connector entry GlassEngine printed." },
          { status: 401 },
        );
      }
      return handler.fetch(req);
    },
  });
  return {
    url: `http://127.0.0.1:${http.port}/mcp`,
    changed: () => handler.notify.resourcesChanged(),
    async stop() {
      await handler.close();
      await http.stop(true);
    },
  };
}
