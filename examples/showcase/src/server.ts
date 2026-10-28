// Entry point: serve the showcase MCP server at http://127.0.0.1:<PORT>/mcp (default 27280).

import { join } from "node:path";
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createBoard } from "./board.ts";
import { createShowcaseServer, type ShowcaseState } from "./mcp.ts";
import { createSetup } from "./setup.ts";
import { loadSkills } from "./skills.ts";
import { createTour } from "./tour.ts";
import { renderPage } from "./ui.ts";

/**
 * Everything one running showcase needs: shared state and the HTTP handler over it. With a
 * `token`, every request must carry `Authorization: Bearer <token>`.
 */
export function createShowcase(options: { token?: string } = {}) {
  const state: ShowcaseState = {
    board: createBoard(),
    tour: createTour(),
    setup: createSetup(),
    skills: loadSkills(join(import.meta.dir, "..", "skills")),
    page: renderPage,
  };
  const handler = createMcpHandler(() => createShowcaseServer(state), {
    maxRequestBodySize: 256 * 1024,
    onerror: (error) => console.error(`[showcase] ${error.message}`),
  });
  // After every write, tell listening clients the resources changed. NimbleBrain relays the notice
  // to this server's open frames, which re-read the board.
  state.board.onChange(() => handler.notify.resourcesChanged());
  state.setup.onChange(() => handler.notify.resourcesChanged());

  const fetch = (request: Request): Promise<Response> | Response => {
    // Answer only requests addressed to this machine.
    const refused =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());
    if (refused) return refused;
    if (options.token && request.headers.get("authorization") !== `Bearer ${options.token}`) {
      return new Response("Unauthorized\n", { status: 401 });
    }
    if (new URL(request.url).pathname !== "/mcp")
      return new Response("Not found\n", { status: 404 });
    return handler.fetch(request);
  };
  return { state, handler, fetch };
}

if (import.meta.main) {
  const showcase = createShowcase({ token: process.env.SHOWCASE_TOKEN || undefined });
  const http = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT ?? 27280),
    // Longer than the 15 s keepalive, so a listening client's stream stays open between pings.
    idleTimeout: 60,
    fetch: showcase.fetch,
  });
  console.log(`[showcase] MCP server at http://127.0.0.1:${http.port}/mcp`);
  const stop = async () => {
    await showcase.handler.close();
    http.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
