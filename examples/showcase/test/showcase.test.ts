import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createBoard } from "../src/board.ts";
import { createShowcase } from "../src/server.ts";
import { createSetup, PANEL_IDS, SETUP_STEPS } from "../src/setup.ts";
import { listEntry, parseFrontmatter } from "../src/skills.ts";
import { createTour, TOUR } from "../src/tour.ts";

/** One MCP request, in the 2026-07-28 form NimbleBrain sends, answered in process with no port. */
async function rpc(
  fetch: (request: Request) => Promise<Response> | Response,
  method: string,
  params: Record<string, unknown> = {},
  host = "127.0.0.1:27280",
) {
  const name = (params.name ?? params.uri) as string | undefined;
  const response = await fetch(
    new Request("http://127.0.0.1:27280/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": method,
        ...(name ? { "Mcp-Name": name } : {}),
        Host: host,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "showcase-test", version: "0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    }),
  );
  return {
    status: response.status,
    // biome-ignore lint/suspicious/noExplicitAny: the tests read loose JSON-RPC bodies.
    body: (await response.json().catch(() => null)) as Record<string, any>,
  };
}

describe("board", () => {
  test("starts from the seed cards", () => {
    const board = createBoard();
    expect(board.stats().total).toBe(8);
    expect(board.list({ status: "todo" }).total).toBe(4);
  });

  test("filters, sorts and pages", () => {
    const board = createBoard();
    const page = board.list({ sort: "points", direction: "desc", limit: 2 });
    expect(page.cards.map((c) => c.points)).toEqual([5, 3]);
    expect(page.total).toBe(8);
    expect(board.list({ tag: "ops", sort: "title" }).cards.map((c) => c.title)).toEqual([
      "Rotate the sample log files",
      "Set up the nightly backup",
    ]);
    expect(board.list({ offset: 6, limit: 5 }).cards).toHaveLength(2);
  });

  test("announces every write and resets to the seed", () => {
    const board = createBoard();
    let changes = 0;
    board.onChange(() => changes++);
    const card = board.add({ title: "  Water the plants ", tag: "ops", points: 2 });
    expect(card).toMatchObject({ title: "Water the plants", status: "todo", id: "c9" });
    board.move(card.id, "done");
    expect(board.get(card.id)?.status).toBe("done");
    board.reset();
    expect(changes).toBe(3);
    expect(board.get(card.id)).toBeUndefined();
  });

  test("refuses an empty title and an unknown id", () => {
    const board = createBoard();
    expect(() => board.add({ title: "  " })).toThrow("title");
    expect(() => board.move("c99", "done")).toThrow("list_cards");
  });
});

describe("tour", () => {
  test("tracks done steps in tour order", () => {
    const tour = createTour();
    expect(tour.progress().next?.id).toBe("welcome");
    tour.mark("board", true);
    tour.mark("welcome", true);
    expect(tour.progress()).toMatchObject({ done: ["welcome", "board"], next: { id: "sync" } });
    expect(tour.mark("board", false).done).toEqual(["welcome"]);
    expect(() => tour.mark("nope", true)).toThrow();
  });

  test("every step names only tools the server has", () => {
    const tools = new Set([
      "start_tour",
      "list_cards",
      "add_card",
      "move_card",
      "board_stats",
      "reset_board",
      "save_tour_step",
      "export_cards",
      "describe_server",
      "show_panel",
    ]);
    for (const step of TOUR) for (const tool of step.tools) expect(tools.has(tool)).toBe(true);
  });
});

describe("setup", () => {
  test("starts, completes and skips steps, one in progress at a time", () => {
    const setup = createSetup();
    expect(setup.view()).toMatchObject({ done: 0, panel: "setup", current: { id: "name" } });
    setup.start("name");
    setup.start("timezone");
    const view = setup.complete("timezone", "  Europe/Lisbon ");
    expect(view.steps.filter((s) => s.status === "in_progress")).toHaveLength(0);
    expect(view.steps.find((s) => s.id === "name")?.status).toBe("pending");
    expect(view.steps.find((s) => s.id === "timezone")).toMatchObject({
      status: "done",
      note: "Europe/Lisbon",
    });
    expect(setup.skip("model", "no key yet").skipped).toBe(1);
    expect(() => setup.skip("name")).toThrow("not optional");
    expect(() => setup.start("nope")).toThrow("get_setup_checklist");
  });

  test("a step moves the app to its panel, and next goes along tour order", () => {
    const setup = createSetup();
    expect(setup.start("look-board").panel).toBe("board");
    expect(setup.showPanel("tour").panel).toBe("tour");
    expect(setup.nextPanel()).toMatchObject({ moved: true, view: { panel: "board" } });
    setup.showPanel("placements");
    expect(setup.nextPanel()).toMatchObject({ moved: false, view: { panel: "placements" } });
  });

  test("every write is announced, and reset clears the checklist", () => {
    const setup = createSetup();
    let changes = 0;
    setup.onChange(() => changes++);
    setup.start("name");
    setup.complete("name");
    setup.showPanel("chart");
    setup.nextPanel();
    expect(setup.reset()).toMatchObject({ done: 0, panel: "setup" });
    expect(changes).toBe(5);
  });

  test("has a first-look step for every panel after setup", () => {
    const looks = SETUP_STEPS.filter((s) => s.id.startsWith("look-")).map((s) => s.panel);
    expect(looks).toEqual(PANEL_IDS.filter((id) => id !== "setup"));
  });
});

describe("skills", () => {
  test("reads plain frontmatter and refuses what a YAML parser could read differently", () => {
    expect(parseFrontmatter("---\nname: a\ndescription: Does a thing.\n---\nBody")).toEqual({
      name: "a",
      description: "Does a thing.",
    });
    expect(() => parseFrontmatter("---\nname: 'a'\n---\n")).toThrow();
    expect(() => parseFrontmatter("---\ndescription: one: two\n---\n")).toThrow();
    expect(() => parseFrontmatter("no frontmatter")).toThrow();
  });

  test("lists a skill with the digest and size of its exact bytes", () => {
    const text = "---\nname: a\ndescription: d\n---\nBody é\n";
    const entry = listEntry({
      uri: "skill://a/SKILL.md",
      text,
      frontmatter: { name: "a", description: "d" },
    });
    const bytes = Buffer.from(text, "utf8");
    expect(entry.resources[0]).toEqual({
      uri: "skill://a/SKILL.md",
      size: bytes.byteLength,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
  });
});

describe("MCP server setup tools", () => {
  test("opens the setup app from its checklist tool", async () => {
    const { fetch } = createShowcase();
    const listed = await rpc(fetch, "tools/list");
    const tool = listed.body.result.tools.find((t: { name: string }) => t.name === "get_setup_checklist");
    const uri = tool?._meta?.ui?.resourceUri;
    expect(uri).toBe("ui://showcase/app");
    const page = await rpc(fetch, "resources/read", { uri });
    expect(page.body.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(page.body.result.contents[0].text).toContain('name="showcase-page" content="app"');
    const checklist = await rpc(fetch, "tools/call", { name: "get_setup_checklist", arguments: {} });
    expect(checklist.body.result.structuredContent.panel).toBe("setup");
  });

  test("drive the checklist over MCP and announce each write", async () => {
    const showcase = createShowcase();
    let changes = 0;
    showcase.state.setup.onChange(() => changes++);
    const call = async (name: string, args: Record<string, unknown> = {}) =>
      (await rpc(showcase.fetch, "tools/call", { name, arguments: args })).body.result;
    expect((await call("get_setup_checklist")).structuredContent.total).toBe(12);
    expect((await call("start_setup_step", { step: "theme" })).structuredContent.current.id).toBe(
      "theme",
    );
    const done = await call("complete_setup_step", { step: "theme", note: "dark" });
    expect(done.structuredContent.done).toBe(1);
    expect((await call("show_panel", { panel: "chart" })).structuredContent.panel).toBe("chart");
    expect((await call("next_panel")).structuredContent).toMatchObject({
      panel: "bridge",
      moved: true,
    });
    expect((await call("skip_setup_step", { step: "name" })).isError).toBe(true);
    expect(changes).toBe(4);
  });
});

describe("MCP server", () => {
  test("lists every tool and marks the screen's own tools app-only", async () => {
    const { fetch } = createShowcase();
    const { body } = await rpc(fetch, "tools/list");
    const tools = body.result.tools as { name: string; _meta?: { ui?: Record<string, unknown> } }[];
    const appOnly = tools.filter((t) =>
      (t._meta?.ui?.visibility as string[] | undefined)?.includes("app"),
    );
    expect(tools).toHaveLength(16);
    expect(appOnly.map((t) => t.name).sort()).toEqual([
      "describe_server",
      "export_cards",
      "save_tour_step",
    ]);
    expect(tools.find((t) => t.name === "start_tour")?._meta?.ui?.resourceUri).toBe(
      "ui://showcase/tour",
    );
  });

  test("a tool call changes the shared board and announces it", async () => {
    const showcase = createShowcase();
    let changes = 0;
    showcase.state.board.onChange(() => changes++);
    const { body } = await rpc(showcase.fetch, "tools/call", {
      name: "move_card",
      arguments: { id: "c5", status: "done" },
    });
    expect(body.result.structuredContent.card).toMatchObject({ id: "c5", status: "done" });
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent);
    expect(changes).toBe(1);
    const missing = await rpc(showcase.fetch, "tools/call", {
      name: "move_card",
      arguments: { id: "x", status: "done" },
    });
    expect(missing.body.result.isError).toBe(true);
  });

  test("serves each page as one self-contained MCP App document", async () => {
    const { fetch } = createShowcase();
    for (const page of ["app", "tour", "table"]) {
      const { body } = await rpc(fetch, "resources/read", { uri: `ui://showcase/${page}` });
      const [content] = body.result.contents;
      expect(content.mimeType).toBe("text/html;profile=mcp-app");
      expect(content.text).toContain(`<meta name="showcase-page" content="${page}">`);
      expect(content.text).toContain("window.Synapse");
      expect(content.text).not.toContain("<!-- scripts -->");
      expect(content.text.match(/<\/script>/g)).toHaveLength(2);
    }
  });

  test("declares the skills extension and lists a skill that matches the bytes it serves", async () => {
    const { fetch } = createShowcase();
    const discover = await rpc(fetch, "server/discover");
    expect(Object.keys(discover.body.result.capabilities.extensions)).toContain(
      "io.modelcontextprotocol/skills",
    );
    const { body } = await rpc(fetch, "skills/list");
    const [entry] = body.result.skills;
    expect(entry.frontmatter.name).toBe("showcase-guide");
    const read = await rpc(fetch, "resources/read", { uri: entry.uri });
    const text = read.body.result.contents[0].text as string;
    const digest = `sha256:${createHash("sha256").update(text).digest("hex")}`;
    expect(entry.resources[0].digest).toBe(digest);
  });

  test("answers only requests addressed to this machine, on /mcp only", async () => {
    const { fetch } = createShowcase();
    expect((await rpc(fetch, "tools/list", {}, "example.com")).status).toBe(403);
    const other = await fetch(
      new Request("http://127.0.0.1:27280/other", { headers: { Host: "127.0.0.1:27280" } }),
    );
    expect(other.status).toBe(404);
  });

  test("with a token, refuses a request that does not carry it", async () => {
    const { fetch } = createShowcase({ token: "sample-token" });
    expect((await rpc(fetch, "tools/list")).status).toBe(401);
    const withToken = (request: Request) => {
      request.headers.set("Authorization", "Bearer sample-token");
      return fetch(request);
    };
    expect((await rpc(withToken, "tools/list")).status).toBe(200);
  });
});
