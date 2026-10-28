import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { type ServerHandle, startServer } from "../../src/api/server.ts";
import { Runtime } from "../../src/runtime/runtime.ts";
import { devProvider, devWorkspace } from "../helpers/dev-provider.ts";
import { createEchoModel } from "../helpers/echo-model.ts";
import { newMcpClient } from "../helpers/mcp-client.ts";
import { testAuthAdapter } from "../helpers/test-auth-adapter.ts";
import { makeTestWorkDir } from "../helpers/test-workdir.ts";

for (const mode of ["configured", "injected"] as const) {
  describe(`${mode} dev API network boundary`, () => {
    const { workDir, cleanup } = makeTestWorkDir(`api-network-${mode}`);
    let runtime: Runtime;
    let handle: ServerHandle;
    let baseUrl: string;
    let wsId: string;

    beforeAll(async () => {
      if (mode === "configured") {
        await writeFile(join(workDir, "instance.json"), '{"auth":{"adapter":"dev"}}');
      }
      runtime = await Runtime.start({
        workDir,
        ...(mode === "injected" ? { identityProvider: devProvider } : {}),
        languageModel: createEchoModel(),
        logging: { disabled: true },
      });
      wsId = await devWorkspace(runtime);
      handle = startServer({ runtime, port: 0 });
      baseUrl = `http://127.0.0.1:${handle.port}`;
    });

    afterAll(async () => {
      handle?.stop(true);
      await runtime?.shutdown();
      cleanup();
    });

    it("binds the real Bun listener to IPv4 loopback", () => {
      expect(handle.server.hostname).toBe("127.0.0.1");
    });

    it("rejects foreign and malformed Host before any route or preflight", async () => {
      for (const host of [
        "attacker.example",
        `attacker.example:${handle.port}`,
        "localhost.attacker.example",
        "localhost@attacker.example",
        "127.0.0.2",
        "192.0.2.1",
        "[::]",
        "localhost, attacker.example",
        "localhost/path",
        "",
      ]) {
        for (const [method, path] of [
          ["GET", "/v1/health"],
          ["GET", "/v1/bootstrap"],
          ["POST", `/mcp/${wsId}`],
          ["OPTIONS", "/v1/bootstrap"],
          ["POST", "/not-a-route"],
        ]) {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { Host: host },
          });
          expect(response.status, `${method} ${path} Host=${host}`).toBe(403);
          await response.arrayBuffer();
        }
      }
    });

    it("serves local health, bootstrap and MCP through local proxy authorities", async () => {
      for (const hostname of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"]) {
        const host = `${hostname}:${handle.port}`;
        for (const path of ["/v1/health", "/v1/bootstrap"]) {
          const response = await fetch(`${baseUrl}${path}`, { headers: { Host: host } });
          expect(response.status).toBe(200);
          await response.arrayBuffer();
        }
        const client = newMcpClient();
        try {
          await client.connect(
            new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp/${wsId}`), {
              requestInit: { headers: { Host: host } },
            }),
          );
          expect((await client.listTools()).tools.length).toBeGreaterThan(0);
        } finally {
          await client.close();
        }
      }
      const response = await fetch(`http://localhost:${handle.port}/v1/health`);
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    });
  });
}

describe("an authenticated provider keeps hosted reachability", () => {
  const { workDir, cleanup } = makeTestWorkDir("api-network-hosted");
  let runtime: Runtime;
  let handle: ServerHandle;

  beforeAll(async () => {
    // An injected provider owns authentication even when the file names dev.
    await writeFile(join(workDir, "instance.json"), '{"auth":{"adapter":"dev"}}');
    runtime = await Runtime.start({
      workDir,
      identityProvider: testAuthAdapter("network-boundary-test-token"),
      languageModel: createEchoModel(),
      logging: { disabled: true },
    });
    handle = startServer({ runtime, port: 0 });
  });

  afterAll(async () => {
    handle?.stop(true);
    await runtime?.shutdown();
    cleanup();
  });

  it("authenticates requests on a hosted hostname", async () => {
    for (const [authorization, status] of [
      ["", 401],
      ["Bearer network-boundary-test-token", 200],
    ] as const) {
      const response = await fetch(`http://127.0.0.1:${handle.port}/v1/bootstrap`, {
        headers: { Host: "app.example.test", Authorization: authorization },
      });
      expect(response.status).toBe(status);
      await response.arrayBuffer();
    }
  });
});
