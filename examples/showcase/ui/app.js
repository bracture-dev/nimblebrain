// The showcase page. Plain browser JavaScript with no build step: the server inlines this file
// after NimbleBrain's Synapse SDK, which defines window.Synapse.
const Synapse = window.Synapse;

const PAGE = document.querySelector('meta[name="showcase-page"]')?.content ?? "app";

const PANELS = [
  {
    id: "setup",
    label: "Welcome",
    tools: [
      "get_setup_checklist",
      "start_setup_step",
      "complete_setup_step",
      "skip_setup_step",
      "show_panel",
      "next_panel",
      "reset_setup",
    ],
  },
  { id: "tour", label: "Tour", tools: ["start_tour", "save_tour_step"] },
  { id: "board", label: "Board", tools: ["list_cards", "add_card", "move_card"] },
  { id: "table", label: "Table", tools: ["list_cards"] },
  { id: "chart", label: "Chart", tools: ["board_stats"] },
  { id: "bridge", label: "Buttons", tools: ["export_cards"] },
  { id: "server", label: "This app", tools: ["describe_server"] },
  { id: "placements", label: "Places", tools: ["describe_server"] },
];
const STATUSES = ["todo", "doing", "done"];
const TAGS = ["design", "writing", "ops"];
const PAGE_SIZE = 5;

const root = document.getElementById("root");
let app = null;
let panel = PAGE === "app" ? "setup" : PAGE;
let tourData = null;
let setupData = null;
let notices = 0;
const callLog = [];
const tableView = { sort: "created", direction: "asc", tag: "", status: "", offset: 0 };

// ---------------------------------------------------------------- helpers

/** Build an element. Text goes in as text nodes, never as HTML, because card titles come from anyone. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Number.POSITIVE_INFINITY)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children.flat(Number.POSITIVE_INFINITY))
    el.append(child instanceof Node ? child : String(child));
  return el;
}

/** Call one of this server's tools through the host, and keep a log line for the "Calls" box. */
async function call(name, args = {}) {
  const started = performance.now();
  const entry = { name, args, ms: 0, ok: false };
  callLog.unshift(entry);
  callLog.length = Math.min(callLog.length, 20);
  try {
    const result = await app.callTool(name, args);
    entry.ms = Math.round(performance.now() - started);
    if (result.isError) {
      const text = (result.content ?? []).map((block) => block.text ?? "").join(" ");
      throw new Error(text || `${name} failed`);
    }
    entry.ok = true;
    return result.data;
  } finally {
    entry.ms = Math.round(performance.now() - started);
    renderLog();
  }
}

/** Technical detail for developers, collapsed. Nothing here is needed to use the app. */
function dev(...children) {
  return h("details", { class: "dev" }, h("summary", {}, "For developers"), ...children);
}

function errorLine(error) {
  return h("p", { class: "error" }, error instanceof Error ? error.message : String(error));
}

// ---------------------------------------------------------------- panels

async function renderTour() {
  tourData = tourData ?? (await call("start_tour"));
  const done = new Set(tourData.done);
  const steps = tourData.steps.map((step, index) =>
    h(
      "li",
      { class: `step${done.has(step.id) ? " done" : ""}` },
      h("input", {
        type: "checkbox",
        "aria-label": `Mark "${step.title}" done`,
        checked: done.has(step.id),
        onchange: async (event) => {
          const progress = await call("save_tour_step", {
            step: step.id,
            done: event.target.checked,
          });
          tourData = { ...tourData, ...progress };
          render();
        },
      }),
      h("strong", { class: "step-title" }, `${index + 1}. ${step.title}`),
      step.panel === "tour"
        ? h("span")
        : h("button", { onclick: () => openPanel(step.panel) }, "Open"),
      h("p", {}, step.try),
      h("details", { class: "dev" }, h("summary", {}, "How it works"), h("p", {}, step.shows)),
    ),
  );
  const next = tourData.next;
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "NimbleBrain showcase tour"),
    h(
      "p",
      { class: "muted" },
      `${done.size} of ${tourData.steps.length} done.`,
      next ? ` Next: ${next.title}.` : " All done.",
    ),
    h("ol", { class: "steps" }, steps),
  );
}

const STATUS_WORD = { pending: "Not started", in_progress: "In progress", done: "Done", skipped: "Skipped" };
async function renderSetup() {
  setupData = setupData ?? (await call("get_setup_checklist"));
  const data = setupData;
  // Use the host's existing preference controls. A checklist button cannot save a preference.
  let origin = null;
  if (app.hostInfo?.name === "nimblebrain" && app.hostContext?.origin) {
    try {
      const url = new URL(app.hostContext.origin);
      if (url.protocol === "http:" || url.protocol === "https:") origin = url.origin;
    } catch { /* An external host need not provide a NimbleBrain origin. */ }
  }
  const openHostPage = (path) => app.openLink(new URL(path, origin).href);
  const workspace = app.hostContext?.workspace?.id;
  const progress = data.steps.filter((step) => step.status !== "pending");
  return h(
    "div",
    { class: "stack welcome" },
    h("h1", {}, "Make yourself at home"),
    h("p", {}, "Try the sample board, take a tour, or work with your coding agent. Go at your own pace."),
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", onclick: () => openPanel("board") }, "Try the board"),
      h("button", { onclick: () => openPanel("tour") }, "Take the tour"),
      origin && typeof workspace === "string" && workspace.startsWith("ws_")
        ? h("button", { onclick: () => openHostPage(`/w/${encodeURIComponent(workspace.slice(3))}/app/glassengine`) }, "Open GlassEngine")
        : null,
    ),
    h(
      "details",
      { class: "box" },
      h("summary", {}, "Personalize whenever you want"),
      h("p", {}, "Keep your current settings, or choose a time zone, model and theme. None of this is needed to get started."),
      origin
        ? h("button", { onclick: () => openHostPage("/profile/general") }, "Open preferences")
        : h("p", { class: "muted" }, "Preferences are in NimbleBrain: Profile → General."),
    ),
    progress.length
      ? h(
          "details",
          { class: "box" },
          h("summary", {}, "Your progress"),
          h("ul", {}, progress.map((step) =>
            h("li", {}, `${step.title}: ${STATUS_WORD[step.status]}`, step.note ? ` · ${step.note}` : ""),
          )),
        )
      : null,
    h(
      "details",
      { class: "box" },
      h("summary", {}, "Explore the examples"),
      h("div", { class: "row" }, PANELS.filter((p) => p.id !== "setup").map((p) =>
        h("button", { onclick: () => openPanel(p.id) }, p.label),
      )),
    ),
  );
}

async function renderBoard() {
  const { cards } = await call("list_cards", { limit: 100 });
  const title = h("input", {
    placeholder: "New card title",
    maxlength: 120,
    "aria-label": "Card title",
    onkeydown: (event) => event.key === "Enter" && add(),
  });
  const tag = h(
    "select",
    { "aria-label": "Tag" },
    TAGS.map((t) => h("option", { value: t }, t)),
  );
  // A button and Enter, not a form: the frame's sandbox does not allow form submission.
  const add = async () => {
    if (!title.value.trim()) return;
    await call("add_card", { title: title.value, tag: tag.value });
    // No re-render here: the server announces the write, and the notice re-renders every open frame.
  };
  const move = (card, delta) => {
    const status = STATUSES[STATUSES.indexOf(card.status) + delta];
    return status ? () => call("move_card", { id: card.id, status }) : null;
  };
  const columns = STATUSES.map((status) =>
    h(
      "div",
      { class: "column" },
      h("h3", {}, status),
      cards
        .filter((card) => card.status === status)
        .map((card) =>
          h(
            "div",
            { class: "card" },
            h("span", { class: "title" }, card.title),
            h(
              "div",
              { class: "row" },
              h("span", { class: "tag" }, card.tag),
              h("span", { class: "muted" }, `${card.points} pt`),
              h("span", { style: "flex:1" }),
              h(
                "button",
                { "aria-label": "Move left", onclick: move(card, -1), disabled: !move(card, -1) },
                "<",
              ),
              h(
                "button",
                { "aria-label": "Move right", onclick: move(card, 1), disabled: !move(card, 1) },
                ">",
              ),
            ),
          ),
        ),
    ),
  );
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "Board"),
    h(
      "p",
      { class: "muted" },
      "Ask the chat to add or move a card: it shows up here right away.",
    ),
    h(
      "div",
      { class: "row" },
      title,
      tag,
      h("button", { class: "primary", type: "button", onclick: add }, "Add"),
    ),
    h("div", { class: "columns" }, columns),
  );
}

async function renderTable() {
  const args = {
    sort: tableView.sort,
    direction: tableView.direction,
    offset: tableView.offset,
    limit: PAGE_SIZE,
  };
  if (tableView.tag) args.tag = tableView.tag;
  if (tableView.status) args.status = tableView.status;
  const { cards, total, offset } = await call("list_cards", args);
  const set = (change) => {
    Object.assign(tableView, change);
    render();
  };
  const header = (key, label) =>
    h(
      "th",
      {},
      h(
        "button",
        {
          onclick: () =>
            set({
              sort: key,
              direction: tableView.sort === key && tableView.direction === "asc" ? "desc" : "asc",
              offset: 0,
            }),
        },
        label,
        tableView.sort === key ? (tableView.direction === "asc" ? " ^" : " v") : "",
      ),
    );
  const filter = (key, values) =>
    h(
      "select",
      {
        "aria-label": `Filter by ${key}`,
        onchange: (e) => set({ [key]: e.target.value, offset: 0 }),
      },
      h("option", { value: "" }, `any ${key}`),
      values.map((v) => h("option", { value: v, selected: tableView[key] === v }, v)),
    );
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "Table"),
    h("div", { class: "row" }, filter("status", STATUSES), filter("tag", TAGS)),
    h(
      "table",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          header("title", "Title"),
          header("status", "Status"),
          header("tag", "Tag"),
          header("points", "Points"),
        ),
      ),
      h(
        "tbody",
        {},
        cards.map((c) =>
          h(
            "tr",
            {},
            h("td", {}, c.title),
            h("td", {}, c.status),
            h("td", {}, c.tag),
            h("td", {}, c.points),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { disabled: offset === 0, onclick: () => set({ offset: Math.max(0, offset - PAGE_SIZE) }) },
        "Previous",
      ),
      h(
        "button",
        {
          disabled: offset + PAGE_SIZE >= total,
          onclick: () => set({ offset: offset + PAGE_SIZE }),
        },
        "Next",
      ),
      h(
        "span",
        { class: "muted" },
        `${total ? offset + 1 : 0}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`,
      ),
    ),
  );
}

function barChart(title, rows, alt) {
  const width = 320;
  const barHeight = 22;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const labelWidth = 70;
  return h(
    "div",
    { class: "stack" },
    h("h3", {}, title),
    svg(
      "svg",
      {
        class: "chart",
        width: "100%",
        viewBox: `0 0 ${width} ${rows.length * (barHeight + 6)}`,
        role: "img",
        "aria-label": title,
      },
      rows.map((row, i) => {
        const y = i * (barHeight + 6);
        const w = Math.max(2, ((width - labelWidth - 40) * row.value) / max);
        return [
          svg("text", { x: 0, y: y + 15 }, row.label),
          svg("rect", {
            class: `bar${alt ? " alt" : ""}`,
            x: labelWidth,
            y,
            width: w,
            height: barHeight,
            rx: 3,
          }),
          svg("text", { x: labelWidth + w + 6, y: y + 15 }, String(row.value)),
        ];
      }),
    ),
  );
}

async function renderChart() {
  const stats = await call("board_stats");
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "Chart"),
    h(
      "p",
      { class: "muted" },
      `${stats.total} cards, ${stats.points} points. The colors follow your light or dark choice.`,
    ),
    barChart(
      "Points by status",
      STATUSES.map((s) => ({ label: s, value: stats.byStatus[s].points })),
      false,
    ),
    barChart(
      "Cards by tag",
      TAGS.map((t) => ({ label: t, value: stats.byTag[t].cards })),
      true,
    ),
  );
}

function renderBridge() {
  const out = h("pre", {}, "Results show here.");
  const attempt = (label, run) =>
    h(
      "button",
      {
        onclick: async () => {
          try {
            out.textContent = `${label}: ${JSON.stringify(await run()) ?? "sent"}`;
          } catch (error) {
            out.textContent = `${label} failed: ${error.message}`;
          }
        },
      },
      label,
    );
  const supports = ["open", "notify", "requestFile", "openConnectorSettings"].map(
    (name) => `${name}: ${Synapse.hostSupports(app, name) ? "yes" : "no"}`,
  );
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "Bridge"),
    h("p", { class: "muted" }, "Try each button. Each one asks NimbleBrain to do something for this app."),
    h(
      "div",
      { class: "row" },
      attempt("Show a notice", () =>
        Synapse.notify(app, {
          level: "success",
          title: "Hello from the showcase",
          description: "Sent with notify().",
        }),
      ),
      attempt("Post a chat message", () => app.sendMessage("What can the showcase app do?")),
      attempt("Tell the agent what I see", () =>
        app.updateModelContext({ panel: "bridge" }, "The person is on the showcase Bridge panel."),
      ),
      attempt("Save the cards as CSV", async () => {
        const file = await call("export_cards", { format: "csv" });
        return Synapse.downloadFile(app, file.filename, file.text, file.mimeType);
      }),
      attempt("Open the docs", () => app.openLink("https://docs.nimblebrain.ai")),
      attempt("Open the table page", () => Synapse.open(app, "ui://showcase/table")),
    ),
    out,
    dev(h("pre", {}, `host: ${JSON.stringify(app.hostInfo)}\n${supports.join("\n")}`)),
  );
}

async function describe() {
  return call("describe_server");
}

async function renderServer() {
  const info = await describe();
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "What this app offers"),
    h(
      "p",
      { class: "muted" },
      `Everything on screen is also something your agent can do. This app gives your agent ${info.tools.agent.length} actions, and keeps ${info.tools.appOnly.length} for its own screens.`,
    ),
    h("p", {}, `Changes received while this page was open: ${notices}.`),
    dev(
      h("h3", {}, "Tools the agent sees"),
      h("p", {}, info.tools.agent.map((t, i) => [i ? ", " : "", h("code", {}, t)])),
      h("h3", {}, "App-only tools (this screen calls them; the agent never sees them)"),
      h("p", {}, info.tools.appOnly.map((t, i) => [i ? ", " : "", h("code", {}, t)])),
      h("h3", {}, "Instructions sent with the server"),
      h("pre", {}, info.instructions),
      h("h3", {}, `Extensions: ${info.extensions.join(", ")}`),
      info.skills.map((skill) =>
        h(
          "details",
          {},
          h("summary", {}, `Skill ${skill.name}: ${skill.description}`),
          h("pre", {}, skill.text),
        ),
      ),
    ),
  );
}

async function renderPlacements() {
  const info = await describe();
  const open = (uri) => Synapse.open(app, uri).catch((e) => alertLine(e));
  const context = app.hostContext ?? {};
  return h(
    "div",
    { class: "stack" },
    h("h1", {}, "Where this app appears"),
    h(
      "p",
      { class: "muted" },
      "This app shows up in the sidebar, as its own pages, and inside chat answers.",
    ),
    h(
      "ul",
      { class: "steps" },
      info.placements.map((p) =>
        h("li", { class: "row" }, h("span", {}, p.label ?? ""), h("button", { onclick: () => open(p.resourceUri) }, "Open")),
      ),
    ),
    dev(
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, "Slot"), h("th", {}, "Label"), h("th", {}, "Page"))),
        h(
          "tbody",
          {},
          info.placements.map((p) =>
            h("tr", {}, h("td", {}, h("code", {}, p.slot)), h("td", {}, p.label ?? ""), h("td", {}, h("code", {}, p.resourceUri))),
          ),
        ),
      ),
      h(
        "pre",
        {},
        `page: ${PAGE}\ndisplay mode: ${context.displayMode ?? "unset"}\nsize: ${JSON.stringify(app.containerDimensions)}`,
      ),
    ),
  );
}

function alertLine(error) {
  root.append(errorLine(error));
}

const RENDERERS = {
  setup: renderSetup,
  tour: renderTour,
  board: renderBoard,
  table: renderTable,
  chart: renderChart,
  bridge: renderBridge,
  server: renderServer,
  placements: renderPlacements,
};

// ---------------------------------------------------------------- shell

async function openPanel(id) {
  if (PAGE === "app") {
    // The shown panel is shared state: the tool moves every open copy of the app.
    try {
      setupData = await call("show_panel", { panel: id });
    } catch (error) {
      alertLine(error);
      return;
    }
    await render();
    const heading = root.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  } else {
    // A single-panel page (in a chat answer, say) opens the full app instead.
    Synapse.open(app, "ui://showcase/app").catch(alertLine);
  }
}

const logBox = h("details", { class: "calls dev" });

function renderLog() {
  const tools = PANELS.find((p) => p.id === panel)?.tools ?? [];
  logBox.replaceChildren(
    h("summary", {}, "For developers"),
    h("p", {}, "MCP tools this panel calls: ", tools.length ? tools.map((t, i) => [i ? ", " : "", h("code", {}, t)]) : "none"),
    h("p", {}, `Calls from this frame (${callLog.length})`),
    h(
      "pre",
      {},
      callLog
        .map(
          (c) =>
            `${c.ok ? "ok " : "err"} ${String(c.ms).padStart(4)} ms  ${c.name} ${JSON.stringify(c.args)}`,
        )
        .join("\n") || "none yet",
    ),
  );
}

let rendering = 0;
async function render() {
  const ticket = ++rendering;
  let body;
  try {
    // In the full app, the checklist also says which panel is showing.
    if (PAGE === "app") {
      setupData = setupData ?? (await call("get_setup_checklist"));
      panel = setupData.panel;
    }
    body = await RENDERERS[panel]();
  } catch (error) {
    body = errorLine(error);
  }
  if (ticket !== rendering) return; // A newer render started while this one waited.
  const tabs =
    PAGE === "app" && panel !== "setup"
      ? h(
          "nav",
          { class: "tabs", "aria-label": "Showcase panels" },
          PANELS.map((p) =>
            h(
              "button",
              { "aria-current": p.id === panel ? "page" : false, onclick: () => openPanel(p.id) },
              p.label,
            ),
          ),
        )
      : null;
  // While a step shows another panel, keep its Done button in reach.
  const active = PAGE === "app" && panel !== "setup" ? setupData?.current : null;
  const bar =
    active?.status === "in_progress"
      ? h(
          "div",
          { class: "row setup-bar" },
          h("span", {}, active.title),
          h("span", { style: "flex:1" }),
          h(
            "button",
            {
              class: "primary",
              onclick: async () => {
                setupData = await call("complete_setup_step", { step: active.id }).catch(
                  (e) => (alertLine(e), null),
                );
                render();
              },
            },
            "Done",
          ),
          h("button", { onclick: () => openPanel("setup") }, "Back to welcome"),
        )
      : null;
  renderLog();
  root.replaceChildren(...[tabs, bar, body, logBox].filter(Boolean));
  app.updateModelContext(
    { page: PAGE, panel },
    `The person is looking at the showcase ${panel} panel.`,
  );
}

async function start() {
  app = await Synapse.connect({
    name: "showcase",
    version: "0.1.0",
    autoResize: PAGE === "tour",
    on: {
      // The agent called start_tour and NimbleBrain hands its result to this frame.
      "tool-result": (data) => {
        if (data?.content?.steps) {
          tourData = data.content;
          if (panel === "tour") render();
        }
      },
    },
  });
  // The server announced a change. Re-read whatever this frame shows.
  app.on("notifications/resources/list_changed", () => {
    notices += 1;
    tourData = null;
    setupData = null;
    render();
  });
  app.on("theme-changed", () => render());
  renderLog();
  await render();
}

start().catch((error) => root.replaceChildren(errorLine(error)));
