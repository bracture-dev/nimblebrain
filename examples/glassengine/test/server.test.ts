import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { parseConfig } from "../src/config.ts";
import { createGlass } from "../src/glass.ts";
import { type Running, serve, UI_URI } from "../src/server.ts";
import { openStore } from "../src/store.ts";
import { uiHtmlBuilder } from "../src/ui.ts";

const TOKEN = "test-token";
let dir: string;
let running: Running | undefined;
/** NimbleBrain's side: connects with the token. */
let host: Client | undefined;
/** A coding agent: connects with no token. */
let agent: Client | undefined;

async function connect(headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL((running as Running).url), {
      requestInit: { headers },
    }),
  );
  return client;
}

const names = async (c: Client) => (await c.listTools()).tools.map((t) => t.name).sort();
const data = (r: unknown) =>
  (r as { structuredContent: Record<string, unknown> }).structuredContent;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "glassengine-"));
  let changed = () => {};
  const glass = createGlass(parseConfig({}, dir), openStore(dir), { onChange: () => changed() });
  running = serve({ glass, uiHtml: uiHtmlBuilder(), port: 0, token: TOKEN });
  changed = running.changed;
  host = await connect({ authorization: `Bearer ${TOKEN}` });
  agent = await connect({});
});

afterAll(async () => {
  await host?.close();
  await agent?.close();
  await running?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("GlassEngine over MCP", () => {
  test("refuses a request with an unknown token", async () => {
    const res = await fetch((running as Running).url, {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  test("NimbleBrain's door: agent tools, and the screen's tools marked app-only", async () => {
    const { tools } = await (host as Client).listTools();
    const vis = Object.fromEntries(
      tools.map((t) => [
        t.name,
        (t._meta?.ui as { visibility?: string[] } | undefined)?.visibility ?? [],
      ]),
    );
    expect(vis).toEqual({
      list_tabs: [],
      read_transcript: ["model"],
      send_message: ["model"],
      pause: [],
      resume: [],
      get_glass: ["app"],
      person_send: ["app"],
      release_tab: ["app"],
      hand_over: ["app"],
      set_policy: ["app"],
    });
  });

  test("a coding agent's door: only its own chat, status and tab", async () => {
    expect(await names(agent as Client)).toEqual([
      "join",
      "read_transcript",
      "release",
      "reply",
      "set_policy",
      "set_status",
      "wait_for_message",
    ]);
  });

  test("serves the view as one MCP App HTML document", async () => {
    const r = await (host as Client).readResource({ uri: UI_URI });
    const content = r.contents[0] as { mimeType?: string; text?: string };
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toContain("<title>GlassEngine</title>");
    expect(content.text).not.toContain("/*SCRIPT*/");
  });

  test("the sandwich: join, wait, a message from NimbleBrain arrives, the reply shows in the transcript", async () => {
    const a = agent as Client;
    const h = host as Client;
    const joined = data(
      await a.callTool({ name: "join", arguments: { platform: "claude", client: "test" } }),
    );
    const session = joined.session as string;

    const waiting = a.callTool({
      name: "wait_for_message",
      arguments: { session, timeoutSeconds: 10 },
    });
    await Bun.sleep(100);
    const sent = await h.callTool({
      name: "send_message",
      arguments: { tab: "claude", text: "status, please" },
    });
    expect(data(sent).delivery).toBe("queued");
    const got = data(await waiting).messages as { from: string; text: string }[];
    expect(got.map((m) => `${m.from}:${m.text}`)).toEqual(["nimblebrain:status, please"]);

    await a.callTool({ name: "reply", arguments: { session, text: "all green" } });
    const read = data(await h.callTool({ name: "read_transcript", arguments: { tab: "claude" } }));
    const rows = (read.transcript as { from: string; text: string }[]).filter(
      (e) => e.from !== "glass",
    );
    expect(rows.map((e) => `${e.from}:${e.text}`)).toEqual([
      "nimblebrain:status, please",
      "engine:all green",
    ]);

    const second = await a.callTool({ name: "join", arguments: { platform: "claude" } });
    expect(second.isError).toBe(true);
    await h.callTool({ name: "hand_over", arguments: { tab: "claude" } });
    const third = await a.callTool({ name: "join", arguments: { platform: "claude" } });
    expect(third.isError).toBeFalsy();
  });

  test("the joined agent cannot flip a switch until the person allows it", async () => {
    const a = agent as Client;
    const session = data(
      await a.callTool({ name: "join", arguments: { platform: "codex" } }),
    ).session;
    const refused = await a.callTool({
      name: "set_policy",
      arguments: { session, key: "agentsMaySend", value: false },
    });
    expect(refused.isError).toBe(true);
  });
});
