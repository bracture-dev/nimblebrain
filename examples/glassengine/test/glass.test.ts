import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "../src/config.ts";
import { createGlass, type Glass, type Result } from "../src/glass.ts";
import { openStore } from "../src/store.ts";

let dir: string;
let clock: number;

function glassWith(engines: unknown[] = []): Glass {
  return createGlass(parseConfig({ engines }, dir), openStore(dir), { now: () => clock });
}

function value<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glassengine-"));
  clock = Date.parse("2026-01-01T00:00:00Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("config", () => {
  test("starts with the three platform tabs and no engines", () => {
    expect(
      glassWith()
        .tabs()
        .map((t) => `${t.id}:${t.status}`),
    ).toEqual(["claude:not joined", "codex:not joined", "other:not joined"]);
  });

  test("refuses an engine with no adapter, a repeated id, or a platform's id", () => {
    expect(() => parseConfig({ engines: [{ id: "a" }] }, dir)).toThrow(
      /Invalid GlassEngine config/,
    );
    const echo = { id: "a", adapter: { kind: "echo" } };
    expect(() => parseConfig({ engines: [echo, echo] }, dir)).toThrow(/repeats/);
    expect(() => parseConfig({ engines: [{ ...echo, id: "claude" }] }, dir)).toThrow(
      /platform tab/,
    );
  });
});

test("an http engine must be a local endpoint", () => {
  const http = (url: string) => ({ engines: [{ id: "h", adapter: { kind: "http", url } }] });
  expect(() => parseConfig(http("https://agent.example.com/chat"), dir)).toThrow(/Invalid/);
  expect(parseConfig(http("http://localhost:8080/chat"), dir).engines).toHaveLength(1);
});

describe("one session per platform", () => {
  test("a second session is refused until Hand over", async () => {
    const glass = glassWith();
    const first = value(glass.join("claude", "desk"));
    const second = glass.join("claude");
    expect(second.ok).toBe(false);
    expect(!second.ok && second.reason).toContain("Hand over");
    expect(glass.tabs()[0]?.refusedJoinAt).toBeDefined();

    value(glass.handOver("claude"));
    const old = await glass.wait(first.session, 0);
    expect(!old.ok && old.reason).toContain("handed the tab over");
    const next = value(glass.join("claude"));
    expect(next.session).not.toBe(first.session);
    expect(glass.tabs()[0]?.refusedJoinAt).toBeUndefined();
  });

  test("the lease lapses two minutes after the last wait; the tab shows away and frees itself", async () => {
    const glass = glassWith();
    const s = value(glass.join("codex"));
    await glass.wait(s.session, 0);
    clock += 119_000;
    expect(glass.tabs()[1]?.status).toBe("live");
    clock += 2_000;
    expect(glass.tabs()[1]?.status).toBe("away");
    expect(glass.join("codex").ok).toBe(true);
    expect((await glass.wait(s.session, 0)).ok).toBe(false);
  });

  test("an unknown platform is refused with the list", () => {
    const r = glassWith().join("cursor");
    expect(!r.ok && r.reason).toContain("claude, codex, other");
  });
});

describe("the chat", () => {
  test("a message from either side reaches the waiting agent, and its reply shows in the transcript", async () => {
    const glass = glassWith();
    const { session } = value(glass.join("claude"));
    const waiting = glass.wait(session, 5);
    expect(glass.tabs()[0]?.session?.waiting).toBe(true);
    expect(value(await glass.send("claude", "hello from the person", "person")).delivery).toBe(
      "queued",
    );
    expect(value(await waiting).messages.map((m) => m.text)).toEqual(["hello from the person"]);

    value(await glass.send("claude", "and from NimbleBrain", "nimblebrain"));
    expect(value(await glass.wait(session, 0)).messages.map((m) => m.from)).toEqual([
      "nimblebrain",
    ]);

    value(glass.reply(session, "got both"));
    value(glass.setStatus(session, "done"));
    const rows = value(glass.transcript("claude", 50));
    expect(
      rows.filter((e) => e.from !== "glass").map((e) => `${e.from}:${e.kind}:${e.text}`),
    ).toEqual([
      "person:message:hello from the person",
      "nimblebrain:message:and from NimbleBrain",
      "engine:reply:got both",
      "engine:status:done",
    ]);
    expect(glass.tabs()[0]?.state).toBe("done");
  });

  test("an empty wait says so; a paused tab holds messages until resumed", async () => {
    const glass = glassWith();
    const { session } = value(glass.join("claude"));
    expect(value(await glass.wait(session, 0))).toEqual({ messages: [], paused: false });

    value(glass.pause("claude"));
    expect(value(await glass.send("claude", "held", "person")).delivery).toBe("held: tab paused");
    expect(value(await glass.wait(session, 0))).toEqual({ messages: [], paused: true });
    const waiting = glass.wait(session, 5);
    value(glass.resume("claude"));
    expect(value(await waiting).messages.map((m) => m.text)).toEqual(["held"]);
  });

  test("messages sent before anyone joins wait for the session that joins", async () => {
    const glass = glassWith();
    expect(value(await glass.send("other", "early", "person")).delivery).toBe(
      "held: no session joined",
    );
    const j = value(glass.join("other"));
    expect(j.pending).toBe(1);
    expect(value(await glass.wait(j.session, 0)).messages.map((m) => m.text)).toEqual(["early"]);
  });

  test("release ends the session; its next call says why", async () => {
    const glass = glassWith();
    const { session } = value(glass.join("claude"));
    value(glass.release(session));
    expect(glass.tabs()[0]?.status).toBe("not joined");
    const r = glass.reply(session, "too late");
    expect(!r.ok && r.reason).toContain("released the tab");
  });
});

describe("switches", () => {
  test("agents may post and read until the person turns that off; the person always can", async () => {
    const glass = glassWith();
    value(glass.setPolicy("claude", "agentsMaySend", false));
    expect((await glass.send("claude", "x", "nimblebrain")).ok).toBe(false);
    expect((await glass.send("claude", "x", "person")).ok).toBe(true);
    value(glass.setPolicy("claude", "agentsMayRead", false));
    expect(glass.transcript("claude", 10).ok).toBe(false);
    expect(value(glass.transcript(undefined, 50)).some((e) => e.tab === "claude")).toBe(false);
    expect(glass.snapshot(50).transcript.some((e) => e.tab === "claude")).toBe(true);
  });

  test("the joined agent changes its own switches only when the person allows it", () => {
    const glass = glassWith();
    const { session } = value(glass.join("claude"));
    expect(glass.setOwnPolicy(session, "agentsMaySend", false).ok).toBe(false);
    value(glass.setPolicy("claude", "joinedMayChangePolicy", true));
    expect(value(glass.setOwnPolicy(session, "agentsMaySend", false)).policy.agentsMaySend).toBe(
      false,
    );
  });

  test("switches set on screen survive a restart", () => {
    value(glassWith().setPolicy("codex", "agentsMayRead", false));
    expect(glassWith().tabs()[1]?.policy.agentsMayRead).toBe(false);
  });
});

describe("configured engines", () => {
  test("agents may not send to an engine until the person allows it; its reply lands in the chat", async () => {
    const glass = glassWith([{ id: "echo", adapter: { kind: "echo" } }]);
    expect((await glass.send("echo", "hi", "nimblebrain", 5)).ok).toBe(false);
    const sent = value(await glass.send("echo", "hi", "person", 5));
    expect(sent).toMatchObject({ delivery: "done", reply: "echo: hi" });
    expect(glass.join("echo").ok).toBe(false);
  });
});

describe("words for people, detail for agents", () => {
  test("GlassEngine's own lines read plainly and carry the mechanics in detail", async () => {
    const glass = glassWith();
    value(glass.join("claude"));
    glass.join("claude");
    value(glass.pause("claude"));
    value(glass.setPolicy("claude", "agentsMaySend", false));
    await glass.send("claude", "x", "nimblebrain");
    value(glass.handOver("claude"));
    const lines = glass.snapshot(50).transcript.filter((e) => e.from === "glass");
    expect(lines.map((e) => e.text)).toEqual([
      "Claude connected.",
      "Another Claude session tried to connect. Only one can be connected at a time.",
      "Paused. New messages will wait until the tab is resumed.",
      "NimbleBrain's agent can no longer send messages here.",
      "NimbleBrain's agent tried to send a message here, but that is turned off.",
      "You handed this tab over. The next Claude session to connect takes it.",
    ]);
    for (const e of lines) {
      expect(e.text).not.toMatch(/_|session id|lease|agentsMay|joinedMay/);
      expect(e.detail).toBeTruthy();
    }
    expect(lines[3]?.detail).toBe("set_policy agentsMaySend=false by the person");
  });
});
