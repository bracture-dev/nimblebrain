import { type App, connect } from "@nimblebrain/synapse";
import type { TabView } from "../src/glass.ts";
import type { PolicyKey } from "../src/policy.ts";
import type { Entry } from "../src/store.ts";

/**
 * The GlassEngine screen: one chat tab per platform and per configured engine.
 * Every control calls a GlassEngine tool, and the screen re-reads the whole
 * glass (`get_glass`) after each write, when the server announces a change,
 * and every couple of seconds while visible.
 */

interface Snapshot {
  tabs: TabView[];
  transcript: Entry[];
}

/**
 * Everything on this screen is written for the person; the precise mechanics
 * (tool names, switch keys, sessions, leases) live in the tool descriptions,
 * tool results and the model context below, where agents read them.
 */
const SWITCHES: [PolicyKey, (tab: TabView) => string][] = [
  ["agentsMaySend", () => "NimbleBrain's agent can send messages here"],
  ["agentsMayRead", () => "NimbleBrain's agent can read this chat"],
  ["joinedMayChangePolicy", (tab) => `${tab.name} can change these settings`],
];

/** Status words a person reads, keyed by what the server reports. */
const STATUS: Record<string, string> = {
  live: "Connected",
  away: "Away",
  "not joined": "Not connected",
  idle: "Ready",
  busy: "Answering…",
  unavailable: "Can't start",
};

/** What the agent says it is doing, in a person's words. */
const STATE: Record<string, string> = {
  working: "Working",
  waiting: "Waiting for you",
  done: "Done",
  blocked: "Needs help",
};

const ENGINE_KINDS: Record<string, string> = {
  echo: "Repeats each message back. Good for trying the screen out.",
  command: "Runs a program on this computer for each message you send.",
  http: "Sends each message to a service running on this computer.",
};

const POLL_MS = 2000;
const root = document.getElementById("app") as HTMLElement;
let app: App;
let snap: Snapshot = { tabs: [], transcript: [] };
let selected: string | undefined;
let sending = false;
/** What went wrong, for the person; the technical message sits in a tooltip. */
let lastError = "";
let lastErrorDetail = "";

/** A tool said no: its message is already written for the person. */
class Refusal extends Error {}
/** The send box's text, kept across re-renders. */
let draft = "";
let shown = "";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const r = await app.callTool(name, args);
  if (r.isError) {
    const text = (r.content as { text?: string }[] | undefined)?.map((c) => c.text ?? "").join(" ");
    throw new Refusal(text || "That didn't work. Please try again.");
  }
  return r.data;
}

async function refresh(): Promise<void> {
  try {
    const data = (await call("get_glass", { limit: 300 })) as Partial<Snapshot> | undefined;
    if (!Array.isArray(data?.tabs) || !Array.isArray(data?.transcript)) {
      throw new Error(`unexpected get_glass result: ${JSON.stringify(data).slice(0, 200)}`);
    }
    snap = data as Snapshot;
    lastError = "";
  } catch (err) {
    noteError(err);
  }
  if (!selected || !snap.tabs.some((t) => t.id === selected)) selected = snap.tabs[0]?.id;
  const key = JSON.stringify([snap, lastError]);
  if (key === shown) return;
  shown = key;
  render();
  tellAgent();
}

/** Let NimbleBrain's agent see what the person is looking at. */
function tellAgent(): void {
  const tab = snap.tabs.find((t) => t.id === selected);
  if (!tab) return;
  const recent = snap.transcript.filter((e) => e.tab === tab.id).slice(-5);
  app.updateModelContext(
    {
      tab: tab.id,
      status: tab.status,
      paused: tab.paused,
      pending: tab.pending,
      session: tab.session,
      refusedJoinAt: tab.refusedJoinAt,
      policy: tab.policy,
      recent,
    },
    `The person is viewing the "${tab.name}" tab in GlassEngine (status ${tab.status}${tab.paused ? ", paused" : ""}). ` +
      "Post into it with glassengine send_message; read it with read_transcript.",
  );
}

async function act(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    lastError = "";
  } catch (err) {
    noteError(err);
  }
  await refresh();
}

function noteError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  lastError =
    err instanceof Refusal ? message : "Can't reach GlassEngine right now. Is it still running?";
  lastErrorDetail = message;
}

function errorLine(): HTMLElement | string {
  return lastError ? el("p", { className: "error", title: lastErrorDetail }, lastError) : "";
}

function render(): void {
  const typing = document.activeElement instanceof HTMLTextAreaElement;
  const tab = snap.tabs.find((t) => t.id === selected);
  const nav = el(
    "nav",
    {},
    el("h1", {}, "GlassEngine"),
    ...snap.tabs.map((t) =>
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            selected = t.id;
            draft = "";
            render();
            tellAgent();
          },
          ariaCurrent: String(t.id === selected),
        },
        el("span", { className: `dot ${dotOf(t)}` }),
        el("span", {}, t.name),
        t.pending ? el("span", { className: "pill" }, String(t.pending)) : "",
      ),
    ),
  );
  const body = tab
    ? renderTab(tab)
    : el(
        "section",
        { className: "glass" },
        lastError ? errorLine() : el("p", { className: "muted" }, "Loading…"),
      );
  root.replaceChildren(nav, body);
  const feed = root.querySelector("ol.feed");
  if (feed) feed.scrollTop = feed.scrollHeight;
  const box = root.querySelector("textarea");
  if (typing && box) {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

function dotOf(t: TabView): string {
  if (t.paused) return "paused";
  return t.state && t.status === "live" ? t.state : t.status.replace(" ", "-");
}

function time(at: string): string {
  return new Date(at).toLocaleTimeString();
}

function button(label: string, onclick: () => void, className = ""): HTMLButtonElement {
  return el("button", { type: "button", className, onclick }, label);
}

function renderTab(tab: TabView): HTMLElement {
  return el(
    "section",
    { className: "glass" },
    el(
      "div",
      { className: "tank" },
      renderHead(tab),
      renderInfo(tab),
      renderControls(tab),
      renderFeed(tab),
    ),
    renderSendBox(tab),
    renderSwitches(tab),
    errorLine(),
  );
}

function renderFeed(tab: TabView): HTMLElement {
  const rows = snap.transcript.filter((e) => e.tab === tab.id);
  const list = el(
    "ol",
    { className: "feed" },
    ...rows.map((e) =>
      el(
        "li",
        { className: `${e.from} ${e.kind}` },
        e.from === "glass"
          ? ""
          : el("div", { className: "meta" }, `${who(e, tab)} · ${time(e.at)}`),
        el("div", { className: "text" }, lineText(e)),
      ),
    ),
  );
  if (rows.length === 0) {
    list.append(
      el(
        "li",
        { className: "glass" },
        el(
          "div",
          { className: "text" },
          tab.kind === "session" && !tab.session
            ? `No messages yet. Anything you write waits until ${tab.name} connects.`
            : "No messages yet. Write the first one below.",
        ),
      ),
    );
  }
  return list;
}

function lineText(e: Entry): string {
  if (e.kind !== "status") return e.text;
  const state = STATE[e.state ?? ""] ?? e.state ?? "";
  return e.text !== e.state ? `${state}: ${e.text}` : state;
}

function statusWord(tab: TabView): string {
  const word = STATUS[tab.status] ?? tab.status;
  return tab.paused ? `${word} · Paused` : word;
}

function renderHead(tab: TabView): HTMLElement {
  return el(
    "div",
    { className: "head" },
    el("h2", {}, tab.name),
    el("span", { className: `pill ${dotOf(tab)}`, title: tab.problem ?? "" }, statusWord(tab)),
    tab.state && tab.status === "live"
      ? el("span", { className: "pill" }, STATE[tab.state] ?? tab.state)
      : "",
  );
}

const AGENT_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex" };

function renderInfo(tab: TabView): HTMLElement {
  const s = tab.session;
  let text: string;
  if (tab.kind !== "session") {
    text = tab.description ?? ENGINE_KINDS[tab.kind] ?? "";
    if (tab.problem) text += " It can't start right now; check its entry in the config file.";
  } else if (s) {
    const now = s.waiting ? "listening for your messages" : `last heard from ${time(s.lastSeenAt)}`;
    text = `Connected since ${time(s.joinedAt)}${s.client ? ` (${s.client})` : ""} · ${now}`;
  } else {
    const agent = AGENT_NAMES[tab.id] ?? "your agent";
    text = `Not connected yet. In ${agent}, say “join GlassEngine as ${tab.id} and keep answering”.`;
  }
  return el("p", { className: "muted" }, text);
}

function renderControls(tab: TabView): HTMLElement {
  const on = (tool: string) => () => void act(() => call(tool, { tab: tab.id }));
  const box = el(
    "div",
    { className: "controls" },
    tab.paused ? button("Resume", on("resume")) : button("Pause", on("pause")),
  );
  if (!tab.session) return box;
  if (tab.refusedJoinAt) {
    box.append(button("Hand over", on("hand_over"), "primary"));
  }
  box.append(button("Disconnect", on("release_tab")));
  if (!tab.refusedJoinAt) return box;
  return el(
    "div",
    {},
    box,
    el(
      "p",
      { className: "notice" },
      `Another ${tab.name} session asked to connect at ${time(tab.refusedJoinAt)}. Only one can be connected at a time. Press Hand over to let the new one in.`,
    ),
  );
}

function renderSwitches(tab: TabView): HTMLElement {
  const keys = SWITCHES.filter(
    ([key]) => tab.kind === "session" || key !== "joinedMayChangePolicy",
  );
  return el(
    "fieldset",
    {},
    el("legend", {}, "What's allowed"),
    ...keys.map(([key, label]) => {
      const on = tab.policy[key];
      const box = el("input", {
        type: "checkbox",
        checked: on,
        onchange: () => void act(() => call("set_policy", { tab: tab.id, key, value: !on })),
      });
      return el("label", { className: "switch" }, box, label(tab));
    }),
  );
}

function renderSendBox(tab: TabView): HTMLElement {
  const input = el("textarea", {
    placeholder: `Message ${tab.name}…`,
    value: draft,
    oninput: () => {
      draft = input.value;
    },
  });
  // The view runs in a sandboxed frame where form submission is blocked, so the
  // send box is a plain button and a Cmd/Ctrl+Enter shortcut, never a <form>.
  const send = () => {
    const text = input.value.trim();
    if (!text || sending) return;
    draft = "";
    sending = true;
    render();
    void act(() => call("person_send", { tab: tab.id, text })).finally(() => {
      sending = false;
      render();
    });
  };
  input.onkeydown = (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) send();
  };
  const sendButton = el(
    "button",
    { type: "button", className: "primary", disabled: sending, onclick: send },
    sending ? "Sending…" : "Send",
  );
  return el("div", { className: "send" }, input, sendButton);
}

function who(e: Entry, tab: TabView): string {
  switch (e.from) {
    case "person":
      return "You";
    case "nimblebrain":
      return "NimbleBrain's agent";
    case "engine":
      return e.kind === "error" ? `${tab.name} (something went wrong)` : tab.name;
    case "glass":
      return "GlassEngine";
  }
}

async function main(): Promise<void> {
  app = await connect({ name: "glassengine", version: "0.1.0" });
  app.on("notifications/resources/list_changed", () => void refresh());
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, POLL_MS);
  await refresh();
}

/** An error the screen cannot recover from is shown, never left as a blank frame. */
function fail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  root.replaceChildren(
    el(
      "p",
      { className: "error", title: message },
      "Something went wrong on this screen. Reload to try again.",
    ),
  );
}
window.addEventListener("error", (ev) => fail(ev.error ?? ev.message));
window.addEventListener("unhandledrejection", (ev) => fail(ev.reason));
void main().catch(fail);
