// The showcase MCP server: its tools, its ui:// pages and its skills. A fresh McpServer is built
// for every HTTP request; the board and the tour live outside it, so state survives between calls.

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { type Board, SORT_KEYS, STATUSES, TAGS } from "./board.ts";
import { PANEL_IDS, type Setup, SETUP_STEPS } from "./setup.ts";
import { listEntry, SKILLS_EXTENSION, type Skill } from "./skills.ts";
import { TOUR, type Tour } from "./tour.ts";
import { MCP_APP_MIME, PAGES, type Page, pageUri } from "./ui.ts";

/**
 * Where this example asks NimbleBrain to show its pages. The README copies this list into the
 * connector entry of workspace.json; describe_server reports it so the Placements panel can show it.
 */
export const PLACEMENTS = [
  {
    slot: "sidebar.apps",
    resourceUri: pageUri("app"),
    route: "showcase",
    label: "Showcase",
    priority: 20,
  },
  { slot: "main", resourceUri: pageUri("tour"), route: "showcase/tour", label: "Showcase tour" },
  { slot: "main", resourceUri: pageUri("table"), route: "showcase/table", label: "Showcase table" },
];

const INSTRUCTIONS =
  "Showcase: a guided tour of what NimbleBrain does with an MCP App, over a sample task board. " +
  "When the person asks to start, open or continue the tour, call start_tour. To set the person up, call get_setup_checklist and follow it with the setup tools.";

/** A tool that changes the board. */
const WRITES = { readOnlyHint: false } as const;
/** Declares the tool app-only: NimbleBrain leaves it out of every tool list the agent sees. */
const APP_ONLY = { ui: { visibility: ["app"] } } as const;

export interface ShowcaseState {
  board: Board;
  tour: Tour;
  setup: Setup;
  skills: Skill[];
  /** Renders a page's HTML. */
  page(page: Page): string;
}

/**
 * A tool result whose first text block carries the same JSON as structuredContent. Synapse reads
 * that block as `data`, so this departs from the usual rule of a short summary in `content`.
 */
function result<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const CardShape = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(STATUSES),
  tag: z.enum(TAGS),
  points: z.number().int(),
  created: z.number().int(),
});

export function createShowcaseServer(state: ShowcaseState): McpServer {
  const { board, tour, setup } = state;
  const server = new McpServer(
    { name: "showcase", version: "0.1.0" },
    { capabilities: { extensions: { [SKILLS_EXTENSION]: {} } }, instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "start_tour",
    {
      title: "Start the showcase tour",
      description:
        "Open the NimbleBrain showcase tour in the chat: ten short steps, each showing one thing NimbleBrain does with an MCP App. Returns the steps and which are done.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: pageUri("tour") } },
    },
    async () => result({ steps: TOUR, ...tour.progress() }),
  );

  server.registerTool(
    "list_cards",
    {
      title: "List cards",
      description:
        "Cards on the sample board, filtered, sorted and paged. Each card has an id, title, status (todo, doing, done), tag and points.",
      inputSchema: z.object({
        status: z.enum(STATUSES).optional(),
        tag: z.enum(TAGS).optional(),
        sort: z.enum(SORT_KEYS).optional().describe('Default "created"'),
        direction: z.enum(["asc", "desc"]).optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      outputSchema: z.object({
        cards: z.array(CardShape),
        total: z.number().int(),
        offset: z.number().int(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => result(board.list(args)),
  );

  server.registerTool(
    "add_card",
    {
      title: "Add card",
      description: "Add a card to the todo column of the sample board.",
      inputSchema: z.object({
        title: z.string().min(1).max(120),
        tag: z.enum(TAGS).optional(),
        points: z.number().int().min(1).max(8).optional(),
      }),
      outputSchema: z.object({ card: CardShape }),
      annotations: WRITES,
    },
    async (args) => {
      try {
        return result({ card: board.add(args) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "move_card",
    {
      title: "Move card",
      description: "Move a card to another column. Use list_cards to find its id.",
      inputSchema: z.object({ id: z.string(), status: z.enum(STATUSES) }),
      outputSchema: z.object({ card: CardShape }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ id, status }) => {
      try {
        return result({ card: board.move(id, status) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "board_stats",
    {
      title: "Board stats",
      description: "Card and point totals for the sample board, by status and by tag.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => result({ ...board.stats() }),
  );

  server.registerTool(
    "reset_board",
    {
      title: "Reset board",
      description: "Put the sample board back to its starting cards.",
      inputSchema: z.object({}),
      annotations: { ...WRITES, destructiveHint: true, idempotentHint: true },
    },
    async () => {
      board.reset();
      return result({ ...board.stats() });
    },
  );

  const stepId = z.string().describe(`One of: ${SETUP_STEPS.map((s) => s.id).join(", ")}`);
  const panelId = z.enum(PANEL_IDS);

  server.registerTool(
    "get_setup_checklist",
    {
      title: "Get the setup checklist",
      description:
        "The setup checklist: each step with its status, note, the NimbleBrain call that makes the change (via) and the panel it shows; plus the current step and the panel on screen. Call it first, and again whenever you need the state.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => result({ ...setup.view() }),
  );

  server.registerTool(
    "start_setup_step",
    {
      title: "Start a setup step",
      description:
        "Mark a step in progress and show its panel on screen. Only one step is in progress at a time. This does not change any NimbleBrain setting; make the change with the step's via call.",
      inputSchema: z.object({ step: stepId }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ step }) => {
      try {
        return result({ ...setup.start(step) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "complete_setup_step",
    {
      title: "Mark a setup step done",
      description:
        "Mark a step done, with a short note of what was set (for example the timezone chosen). The note shows on screen to the person, so keep keys and secrets out of it.",
      inputSchema: z.object({ step: stepId, note: z.string().max(280).optional() }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ step, note }) => {
      try {
        return result({ ...setup.complete(step, note) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "skip_setup_step",
    {
      title: "Skip a setup step",
      description:
        "Skip an optional step (model, glassengine), with a note saying why. Required steps cannot be skipped.",
      inputSchema: z.object({ step: stepId, note: z.string().max(280).optional() }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ step, note }) => {
      try {
        return result({ ...setup.skip(step, note) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "show_panel",
    {
      title: "Show a panel",
      description:
        "Switch the app on screen to a panel: setup, tour, board, table, chart, bridge, server or placements. Every open copy of the app follows.",
      inputSchema: z.object({ panel: panelId }),
      annotations: { ...WRITES, idempotentHint: true },
    },
    async ({ panel }) => result({ ...setup.showPanel(panel) }),
  );

  server.registerTool(
    "next_panel",
    {
      title: "Go to the next panel",
      description:
        "Show the panel after the one on screen, in tour order. At the last panel it stays there and says moved: false.",
      inputSchema: z.object({}),
      annotations: WRITES,
    },
    async () => {
      const { view, moved } = setup.nextPanel();
      return result({ ...view, moved });
    },
  );

  server.registerTool(
    "reset_setup",
    {
      title: "Reset setup",
      description:
        "Put the checklist back to the start. It only clears this checklist; no NimbleBrain setting changes. Ask first.",
      inputSchema: z.object({}),
      annotations: { ...WRITES, destructiveHint: true, idempotentHint: true },
    },
    async () => result({ ...setup.reset() }),
  );

  server.registerTool(
    "save_tour_step",
    {
      title: "Save tour step",
      description: "Mark a tour step done or not done. Called by the tour screen.",
      inputSchema: z.object({ step: z.string(), done: z.boolean() }),
      _meta: APP_ONLY,
    },
    async ({ step, done }) => {
      try {
        return result({ ...tour.mark(step, done) });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "export_cards",
    {
      title: "Export cards",
      description:
        "Every card as CSV or JSON text with a file name, for the screen to hand to the host's download.",
      inputSchema: z.object({ format: z.enum(["csv", "json"]) }),
      annotations: { readOnlyHint: true },
      _meta: APP_ONLY,
    },
    async ({ format }) => {
      const { cards } = board.list({ limit: 100 });
      if (format === "json") {
        return result({
          filename: "showcase-cards.json",
          mimeType: "application/json",
          text: JSON.stringify(cards, null, 2),
        });
      }
      const rows = cards.map((c) =>
        [c.id, JSON.stringify(c.title), c.status, c.tag, c.points].join(","),
      );
      const text = ["id,title,status,tag,points", ...rows].join("\n");
      return result({ filename: "showcase-cards.csv", mimeType: "text/csv", text });
    },
  );

  server.registerTool(
    "describe_server",
    {
      title: "Describe server",
      description:
        "What this server declares: tools by audience, pages, placements, skills and instructions.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      _meta: APP_ONLY,
    },
    async () =>
      result({
        name: "showcase",
        instructions: INSTRUCTIONS,
        tools: {
          agent: [
            "start_tour",
            "list_cards",
            "add_card",
            "move_card",
            "board_stats",
            "reset_board",
            "get_setup_checklist",
            "start_setup_step",
            "complete_setup_step",
            "skip_setup_step",
            "show_panel",
            "next_panel",
            "reset_setup",
          ],
          appOnly: ["save_tour_step", "export_cards", "describe_server"],
        },
        pages: PAGES.map(pageUri),
        placements: PLACEMENTS,
        extensions: [SKILLS_EXTENSION],
        skills: state.skills.map((s) => ({ uri: s.uri, ...s.frontmatter, text: s.text })),
      }),
  );

  for (const page of PAGES) {
    const uri = pageUri(page);
    server.registerResource(`Showcase ${page}`, uri, { mimeType: MCP_APP_MIME }, async () => ({
      contents: [{ uri, mimeType: MCP_APP_MIME, text: state.page(page) }],
    }));
  }

  for (const skill of state.skills) {
    server.registerResource(skill.uri, skill.uri, { mimeType: "text/markdown" }, async () => ({
      contents: [{ uri: skill.uri, mimeType: "text/markdown", text: skill.text }],
    }));
  }
  const entries = state.skills.map(listEntry);
  // skills/list is an extension method, not a core one, so it goes on the low-level server.
  server.server.setRequestHandler(
    "skills/list",
    { params: z.looseObject({ cursor: z.string().optional() }).optional() },
    async () => ({ skills: entries }),
  );

  return server;
}
