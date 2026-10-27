// The guided tour: one step per stock capability, each naming the panel that shows it and the
// MCP tools that panel calls. The UI renders these steps; start_tour hands them to the agent.

export interface TourStep {
  id: string;
  title: string;
  /** The panel of the showcase app this step opens. */
  panel: "tour" | "board" | "table" | "chart" | "bridge" | "server" | "placements";
  /** What to do, in one or two sentences. */
  try: string;
  /** What it shows about NimbleBrain. */
  shows: string;
  /** Tools the panel calls, without the connector prefix NimbleBrain adds. */
  tools: string[];
}

export const TOUR: readonly TourStep[] = [
  {
    id: "welcome",
    title: "An app is an MCP server",
    panel: "tour",
    try: "Read this list. Each step opens a panel; mark it done when you have tried it.",
    shows:
      "This page is a ui:// resource served by a small MCP server on your machine. NimbleBrain connected to it as a connector and renders the page in a sandboxed frame.",
    tools: ["start_tour", "save_tour_step"],
  },
  {
    id: "board",
    title: "Tools behind a screen",
    panel: "board",
    try: "Add a card, then move it to doing.",
    shows:
      "Every button is an MCP tool call from the frame, through NimbleBrain, to this server. The agent calls the same tools.",
    tools: ["list_cards", "add_card", "move_card"],
  },
  {
    id: "sync",
    title: "Live sync with the agent",
    panel: "board",
    try: 'With the Board open, ask the chat: "move the release note card to doing".',
    shows:
      "After any write, the server announces that its resources changed. NimbleBrain relays the notice to every open frame of this server, and the board re-reads itself.",
    tools: ["list_cards", "move_card"],
  },
  {
    id: "table",
    title: "Tables",
    panel: "table",
    try: "Sort by points, filter by a tag, and page through the cards.",
    shows:
      "Sorting, filtering and paging are arguments to one read tool, so the agent can ask for the same view.",
    tools: ["list_cards"],
  },
  {
    id: "chart",
    title: "Visuals and theme",
    panel: "chart",
    try: "Look at the chart, then switch NimbleBrain between light and dark mode.",
    shows:
      "The chart is plain SVG drawn from a tool result. Colors and fonts come from the theme tokens the host sends, so the app follows the host's theme.",
    tools: ["board_stats"],
  },
  {
    id: "bridge",
    title: "The bridge to the host",
    panel: "bridge",
    try: "Try each button: a notice, a chat message, context for the agent, a saved file, a link, a page opened by URI.",
    shows:
      "Besides tool calls, a frame can ask the host for things only the host can do. Each button is one bridge request, made with NimbleBrain's Synapse SDK.",
    tools: ["export_cards"],
  },
  {
    id: "app-only",
    title: "App-only tools",
    panel: "server",
    try: "Compare the agent's tools with the app-only ones.",
    shows:
      "A tool that declares visibility app is callable by the screen only: NimbleBrain leaves it out of every tool list an agent sees and refuses an agent that calls it anyway. export_cards and save_tour_step are app-only.",
    tools: ["describe_server"],
  },
  {
    id: "skill",
    title: "Guidance the server publishes",
    panel: "server",
    try: "Read the skill this server publishes.",
    shows:
      "The server publishes a skill through the MCP skills extension. NimbleBrain gives it to its agent before the agent first calls one of this server's tools.",
    tools: ["describe_server"],
  },
  {
    id: "placements",
    title: "Placements",
    panel: "placements",
    try: "Open the table as its own page, then come back from the sidebar.",
    shows:
      "One server can fill several places in the shell: a sidebar entry, pages in the main area, and a view inside a chat answer.",
    tools: ["describe_server"],
  },
  {
    id: "build",
    title: "Build your own",
    panel: "tour",
    try: "Copy this example's folder, rename the server, and change one tool.",
    shows:
      "Everything here is stock NimbleBrain plus one small server and one plain page, with no build step. The README lists the files.",
    tools: [],
  },
];

export interface TourProgress {
  done: string[];
  next: TourStep | null;
}

export interface Tour {
  progress(): TourProgress;
  mark(id: string, done: boolean): TourProgress;
}

export function createTour(): Tour {
  const done = new Set<string>();
  const progress = (): TourProgress => ({
    done: TOUR.filter((step) => done.has(step.id)).map((step) => step.id),
    next: TOUR.find((step) => !done.has(step.id)) ?? null,
  });
  return {
    progress,
    mark(id, isDone) {
      if (!TOUR.some((step) => step.id === id)) throw new Error(`No tour step named ${id}.`);
      if (isDone) done.add(id);
      else done.delete(id);
      return progress();
    },
  };
}
