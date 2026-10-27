import { describe, expect, test } from "bun:test";
import { adapterProblem, runTurn } from "../src/adapters.ts";
import { parseConfig } from "../src/config.ts";

const ctx = { engine: "e", turn: "t1" };
const adapterOf = (adapter: unknown) => {
  const engine = parseConfig({ engines: [{ id: "e", adapter }] }, import.meta.dir).engines[0];
  if (!engine) throw new Error("no engine");
  return engine.adapter;
};

describe("adapters", () => {
  test("echo answers with the prompt", async () => {
    expect(await runTurn(adapterOf({ kind: "echo" }), "hello", ctx)).toBe("echo: hello");
  });

  test("command passes the prompt on stdin or as the last argument, with the turn in its env", async () => {
    expect(await runTurn(adapterOf({ kind: "command", command: ["cat"] }), "on stdin", ctx)).toBe(
      "on stdin",
    );
    const arg = adapterOf({ kind: "command", command: ["echo"], prompt: "argument" });
    expect(await runTurn(arg, "as argument", ctx)).toBe("as argument");
    const env = adapterOf({
      kind: "command",
      command: ["sh", "-c", 'echo "$GLASSENGINE_ENGINE/$GLASSENGINE_TURN"'],
    });
    expect(await runTurn(env, "", ctx)).toBe("e/t1");
  });

  test("command reports a failing exit and a missing program", async () => {
    const fail = adapterOf({ kind: "command", command: ["sh", "-c", "echo nope >&2; exit 3"] });
    expect(runTurn(fail, "", ctx)).rejects.toThrow("exited with code 3: nope");
    expect(
      adapterProblem(adapterOf({ kind: "command", command: ["no-such-agent-cli-xyz"] })),
    ).toContain("not found");
  });

  test("http posts the prompt and reads the reply field", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as { prompt: string; engine: string; turn: string };
        return Response.json({ reply: `${body.engine}/${body.turn}: ${body.prompt}` });
      },
    });
    try {
      const http = adapterOf({ kind: "http", url: `http://127.0.0.1:${server.port}/chat` });
      expect(await runTurn(http, "hi", ctx)).toBe("e/t1: hi");
    } finally {
      await server.stop(true);
    }
  });
});
