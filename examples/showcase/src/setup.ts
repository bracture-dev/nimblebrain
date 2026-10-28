// Optional personalization after bootstrap, one step per tool-visible action. The
// showcase only tracks and shows progress; NimbleBrain's own tools make the changes (the `via`
// field names the call). The checklist also holds which panel the app is showing, so an agent can
// move the person around the app with a tool and the screen follows.

export const PANEL_IDS = [
  "setup",
  "tour",
  "board",
  "table",
  "chart",
  "bridge",
  "server",
  "placements",
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const STEP_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface SetupStep {
  id: string;
  /** The label the person sees. */
  title: string;
  /** One friendly line to the person, shown under the label. Nothing technical. */
  blurb: string;
  /** Guidance for the agent only: what to ask and how to confirm. The screen never shows it. */
  instruction: string;
  /** The NimbleBrain call that makes the change, written as `tool {arguments}`; empty when the step changes nothing. For the agent only. */
  via: string;
  /** The panel the app shows while this step is in progress. */
  panel: PanelId;
  /** Optional steps may be skipped. */
  optional: boolean;
}

/** The panels after "setup", in tour order. Each gets a "first look" step. */
const LOOK_PANELS = PANEL_IDS.filter((id) => id !== "setup");
const LOOK_LABEL: Record<string, string> = {
  tour: "the tour",
  board: "the board",
  table: "the table",
  chart: "the chart",
  bridge: "what an app can ask of NimbleBrain",
  server: "what this app offers",
  placements: "where an app can appear",
};
const LOOK_BLURB: Record<string, string> = {
  tour: "A short walk through what NimbleBrain can do.",
  board: "A sample task board you can change by hand or by asking.",
  table: "The same cards as a table you can sort and filter.",
  chart: "A chart that follows your light or dark choice.",
  bridge: "Buttons that ask NimbleBrain for a notice, a file or a message.",
  server: "What this app offers, for the curious.",
  placements: "The places this app can show up in NimbleBrain.",
};

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    id: "name",
    title: "Your name",
    blurb: "What should NimbleBrain call you?",
    instruction: "Offer to keep the existing name or change it. Ask for text only if they choose to change it, then save it.",
    via: 'nb__set_preferences {"displayName": "<name>"}',
    panel: "setup",
    optional: true,
  },
  {
    id: "timezone",
    title: "Time zone",
    blurb: "Where are you, so times show up right?",
    instruction:
      "Offer to keep the existing timezone or choose one in Profile → General. Use a short list of likely zones if guiding them with native questions; save only their chosen IANA timezone.",
    via: 'nb__set_preferences {"timezone": "<Area/City>"}',
    panel: "setup",
    optional: true,
  },
  {
    id: "theme",
    title: "Light or dark",
    blurb: "Pick how NimbleBrain looks.",
    instruction: "Offer clickable Light, Dark and System choices in the client's native question tool, or open Profile → General. Save only their choice.",
    via: 'nb__set_preferences {"theme": "light" | "dark" | "system"}',
    panel: "setup",
    optional: true,
  },
  {
    id: "model",
    title: "Your model",
    blurb: "Choose which AI model answers you. You can skip this for now.",
    instruction:
      "Offer to keep the current model or open Profile → General, which lists available models. Do not ask the person to type a provider:model-id. Skip if they want to choose later or have no provider key yet.",
    via: 'nb__set_preferences {"model": "<provider:model-id>"}',
    panel: "setup",
    optional: true,
  },
  {
    id: "glassengine",
    title: "Bring your own agent",
    blurb: "See your coding agent in its NimbleBrain tab. You can skip this for now.",
    instruction:
      "Inspect the existing GlassEngine connector and platform tab first. If this session has already joined, show the tab and note that it is ready. Otherwise ask whether the person wants to connect their coding agent. If yes, reuse the connector, register it only if absent, and join only if this session has not joined. If another session owns the tab, ask the person before handing it over. If no, skip.",
    via: "",
    panel: "setup",
    optional: true,
  },
  ...LOOK_PANELS.map(
    (panel): SetupStep => ({
      id: `look-${panel}`,
      title: `Take a look: ${LOOK_LABEL[panel]}`,
      blurb: LOOK_BLURB[panel],
      instruction: `Only when the person wants to explore: show the ${panel} panel with show_panel, say in a sentence what it demonstrates, and mark the step done when the person has seen it.`,
      via: "",
      panel,
      optional: true,
    }),
  ),
];

export interface StepState {
  status: StepStatus;
  note: string;
}

export interface SetupView {
  steps: Array<SetupStep & StepState>;
  done: number;
  skipped: number;
  total: number;
  /** The step in progress, or the first one not finished; null when every step is finished. */
  current: (SetupStep & StepState) | null;
  /** The panel the app is showing. */
  panel: PanelId;
}

export interface Setup {
  view(): SetupView;
  start(id: string): SetupView;
  complete(id: string, note?: string): SetupView;
  skip(id: string, note?: string): SetupView;
  showPanel(panel: PanelId): SetupView;
  /** Move to the panel after the one showing. At the last panel it stays and reports so. */
  nextPanel(): { view: SetupView; moved: boolean };
  reset(): SetupView;
  /** Called after every write. Returns a function that stops listening. */
  onChange(listener: () => void): () => void;
}

const NOTE_LIMIT = 280;

export function createSetup(): Setup {
  const states = new Map<string, StepState>();
  let panel: PanelId = "setup";
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const fresh = () => {
    states.clear();
    for (const step of SETUP_STEPS) states.set(step.id, { status: "pending", note: "" });
    panel = "setup";
  };
  fresh();

  const step = (id: string) => {
    const found = SETUP_STEPS.find((s) => s.id === id);
    if (!found) {
      throw new Error(
        `No setup step named ${id}. Call get_setup_checklist to see the ids: ${SETUP_STEPS.map((s) => s.id).join(", ")}.`,
      );
    }
    return found;
  };
  const merged = (s: SetupStep) => ({ ...s, ...(states.get(s.id) as StepState) });
  const view = (): SetupView => {
    const steps = SETUP_STEPS.map(merged);
    const current =
      steps.find((s) => s.status === "in_progress") ??
      steps.find((s) => s.status === "pending") ??
      null;
    return {
      steps,
      done: steps.filter((s) => s.status === "done").length,
      skipped: steps.filter((s) => s.status === "skipped").length,
      total: steps.length,
      current,
      panel,
    };
  };
  const finish = (id: string, status: StepStatus, note = "") => {
    const found = step(id);
    if (status === "skipped" && !found.optional) {
      throw new Error(`Step ${id} is not optional. Complete it, or leave it pending.`);
    }
    states.set(id, { status, note: note.trim().slice(0, NOTE_LIMIT) });
    changed();
    return view();
  };

  return {
    view,
    start(id) {
      const found = step(id);
      for (const [other, state] of states) {
        if (state.status === "in_progress" && other !== id) state.status = "pending";
      }
      const state = states.get(id) as StepState;
      state.status = "in_progress";
      panel = found.panel;
      changed();
      return view();
    },
    complete: (id, note) => finish(id, "done", note),
    skip: (id, note) => finish(id, "skipped", note),
    showPanel(next) {
      panel = next;
      changed();
      return view();
    },
    nextPanel() {
      const index = PANEL_IDS.indexOf(panel);
      const next = PANEL_IDS[index + 1];
      if (!next) return { view: view(), moved: false };
      panel = next;
      changed();
      return { view: view(), moved: true };
    },
    reset() {
      fresh();
      changed();
      return view();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
