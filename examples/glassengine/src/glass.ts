import { adapterProblem, runTurn } from "./adapters.ts";
import { type EngineConfig, type GlassConfig, PLATFORMS, type Platform } from "./config.ts";
import { defaultPolicy, isPolicyKey, mergePolicy, type Policy, type PolicyKey } from "./policy.ts";
import type { Entry, Store } from "./store.ts";

/**
 * The glass: one tab per platform (an agent joins it from its own session and
 * loops on wait and reply) and one tab per engine from the config file (a
 * program or endpoint GlassEngine runs once per message).
 */

const PLATFORM_NAMES: Record<Platform, string> = {
  claude: "Claude",
  codex: "Codex",
  other: "Other",
};

/** Who writes into a tab from the NimbleBrain side. */
export type Sender = "person" | "nimblebrain";

/** What the screen and the tools show about one tab. */
export interface TabView {
  id: string;
  name: string;
  description?: string;
  /** `session` for a platform tab; otherwise the configured engine's adapter kind. */
  kind: "session" | EngineConfig["adapter"]["kind"];
  /**
   * Platform tab: `live` (a session is joined and waiting, or waited within the
   * lease), `away` (the joined session stopped waiting; its lease lapsed), or
   * `not joined`. Engine tab: `idle`, `busy` or `unavailable`.
   */
  status: string;
  paused: boolean;
  /** Messages held for the joined agent, not yet delivered by a wait. */
  pending: number;
  session?: { joinedAt: string; lastSeenAt: string; waiting: boolean; client?: string };
  /** When a second session of this platform last asked to join and was refused. */
  refusedJoinAt?: string;
  /** The state the engine last reported (working, waiting, done, blocked). */
  state?: string;
  problem?: string;
  policy: Policy;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface Joined {
  session: string;
  tab: string;
  leaseSeconds: number;
  pending: number;
}

export interface Waited {
  messages: Entry[];
  paused: boolean;
}

export interface Sent {
  entry: Entry;
  /** Where the message is now: with the joined agent's next wait, held, or answered by an engine. */
  delivery:
    | "queued"
    | "held: tab paused"
    | "held: no session joined"
    | "done"
    | "failed"
    | "running";
  reply?: string;
  error?: string;
}

export interface Glass {
  tabs(): TabView[];
  join(platform: string, client?: string): Result<Joined>;
  wait(session: string, seconds: number, signal?: AbortSignal): Promise<Result<Waited>>;
  reply(session: string, text: string): Result<Entry>;
  setStatus(session: string, state: string, note?: string): Result<Entry>;
  release(session: string): Result<TabView>;
  /** The joined agent reads its own tab's chat. */
  sessionTranscript(session: string, limit: number, since?: string): Result<Entry[]>;
  send(tab: string, text: string, by: Sender, waitSeconds?: number): Promise<Result<Sent>>;
  /** What agents in the workspace may read: tabs whose switch hides them are left out, or refused when named. */
  transcript(tab: string | undefined, limit: number, since?: string): Result<Entry[]>;
  /** Everything the person's screen shows. Not switch-gated: the person always sees the glass. */
  snapshot(limit: number): { tabs: TabView[]; transcript: Entry[] };
  pause(tab: string): Result<TabView>;
  resume(tab: string): Result<TabView>;
  /** The person ends the tab's session. */
  releaseTab(tab: string): Result<TabView>;
  /** The person ends the tab's session so the session that was refused can join. */
  handOver(tab: string): Result<TabView>;
  /** The person flips a switch on a tab. */
  setPolicy(tab: string, key: string, value: boolean): Result<TabView>;
  /** The joined agent flips a switch on its own tab, when the person allows it. */
  setOwnPolicy(session: string, key: string, value: boolean): Result<TabView>;
}

interface Session {
  id: string;
  joinedAt: number;
  lastSeen: number;
  waiting: number;
  client?: string;
}

interface Tab {
  id: string;
  name: string;
  engine?: EngineConfig;
  session?: Session;
  paused: boolean;
  pending: Entry[];
  waiters: Set<() => void>;
  refusedAt?: number;
  state?: string;
  turn?: string;
}

export interface GlassOptions {
  /** Called after every change the screen shows. */
  onChange?: () => void;
  /** Milliseconds since the epoch; tests replace it to move the lease clock. */
  now?: () => number;
}

export function createGlass(config: GlassConfig, store: Store, opts: GlassOptions = {}): Glass {
  const onChange = opts.onChange ?? (() => {});
  const now = opts.now ?? Date.now;
  const leaseMs = config.leaseSeconds * 1000;
  const tabs = new Map<string, Tab>();
  for (const id of PLATFORMS) tabs.set(id, blank(id, PLATFORM_NAMES[id]));
  for (const e of config.engines) tabs.set(e.id, { ...blank(e.id, e.name ?? e.id), engine: e });
  /** Why each ended session ended, so its next call says so plainly. */
  const ended = new Map<string, string>();
  let turnSeq = 0;

  const iso = (ms: number) => new Date(ms).toISOString();
  const live = (s: Session | undefined): s is Session =>
    !!s && (s.waiting > 0 || now() - s.lastSeen < leaseMs);

  const policyOf = (t: Tab): Policy =>
    mergePolicy(
      mergePolicy(defaultPolicy(t.engine ? "engine" : "session"), t.engine?.policy),
      store.policies()[t.id],
    );

  const record = (entry: Omit<Entry, "id" | "at">): Entry => {
    const e = store.append(entry);
    onChange();
    return e;
  };
  /** A line on the tab: `text` for the person on screen, `detail` for agents reading the transcript. */
  const event = (tab: string, text: string, detail: string) =>
    record({ tab, from: "glass", kind: "event", text, detail });

  const wake = (t: Tab) => {
    for (const w of [...t.waiters]) w();
  };

  const statusOf = (t: Tab, problem: string | null): string => {
    if (t.engine) return t.turn ? "busy" : problem ? "unavailable" : "idle";
    if (!t.session) return "not joined";
    return live(t.session) ? "live" : "away";
  };

  const view = (t: Tab): TabView => {
    const s = t.session;
    const problem = t.engine ? adapterProblem(t.engine.adapter) : null;
    // JSON drops undefined fields, so the optional ones need no guards here.
    return {
      id: t.id,
      name: t.name,
      description: t.engine?.description,
      kind: t.engine ? t.engine.adapter.kind : "session",
      status: statusOf(t, problem),
      paused: t.paused,
      pending: t.pending.length,
      session: s && {
        joinedAt: iso(s.joinedAt),
        lastSeenAt: iso(s.lastSeen),
        waiting: s.waiting > 0,
        client: s.client,
      },
      refusedJoinAt: t.refusedAt ? iso(t.refusedAt) : undefined,
      state: t.state,
      problem: problem ?? undefined,
      policy: policyOf(t),
    };
  };

  const find = (id: string): Result<Tab> => {
    const t = tabs.get(id);
    return t ? { ok: true, value: t } : { ok: false, reason: `no tab named "${id}"` };
  };

  const bySession = (id: string): Result<{ tab: Tab; session: Session }> => {
    for (const tab of tabs.values()) {
      if (tab.session?.id === id) return { ok: true, value: { tab, session: tab.session } };
    }
    const why = ended.get(id) ?? "unknown session";
    return {
      ok: false,
      reason: `This session is no longer joined (${why}). Call join again if the person wants you back.`,
    };
  };

  const end = (t: Tab, why: string) => {
    if (!t.session) return;
    ended.set(t.session.id, why);
    t.session = undefined;
    wake(t);
  };

  const runEngine = (t: Tab, e: EngineConfig, entry: Entry, waitSeconds: number) => {
    turnSeq += 1;
    const turn = `${e.id}-${now().toString(36)}-${turnSeq}`;
    t.turn = turn;
    onChange();
    const done = runTurn(e.adapter, entry.text, { engine: e.id, turn })
      .then((reply): Sent => {
        record({ tab: t.id, from: "engine", kind: "reply", text: reply });
        return { entry, delivery: "done", reply };
      })
      .catch((err: unknown): Sent => {
        const error = err instanceof Error ? err.message : String(err);
        record({ tab: t.id, from: "engine", kind: "error", text: error });
        return { entry, delivery: "failed", error };
      })
      .finally(() => {
        t.turn = undefined;
        onChange();
      });
    const timeout = Bun.sleep(Math.max(0, waitSeconds) * 1000).then(
      (): Sent => ({ entry, delivery: "running" }),
    );
    return Promise.race([done, timeout]);
  };

  /** What a wait answers now, or null to keep waiting. */
  const settled = (
    t: Tab,
    s: Session,
    deadline: number,
    signal?: AbortSignal,
  ): Result<Waited> | null => {
    if (t.session !== s) return bySession(s.id) as Result<never>;
    if (!t.paused && t.pending.length > 0) {
      return { ok: true, value: { messages: t.pending.splice(0), paused: false } };
    }
    if (deadline <= Date.now() || signal?.aborted) {
      return { ok: true, value: { messages: [], paused: t.paused } };
    }
    return null;
  };

  const toEngine = async (
    t: Tab,
    e: EngineConfig,
    text: string,
    by: Sender,
    waitSeconds: number,
  ): Promise<Result<Sent>> => {
    if (t.turn) {
      return {
        ok: false,
        reason: `${t.name} is still answering the last message. Try again when it finishes (turn ${t.turn}).`,
      };
    }
    const problem = adapterProblem(e.adapter);
    if (problem) return { ok: false, reason: problem };
    const entry = record({ tab: t.id, from: by, kind: "message", text });
    return { ok: true, value: await runEngine(t, e, entry, waitSeconds) };
  };

  const toSession = (t: Tab, text: string, by: Sender): Result<Sent> => {
    const entry = record({ tab: t.id, from: by, kind: "message", text });
    t.pending.push(entry);
    wake(t);
    let delivery: Sent["delivery"] = "queued";
    if (t.paused) delivery = "held: tab paused";
    else if (!live(t.session)) delivery = "held: no session joined";
    return { ok: true, value: { entry, delivery } };
  };

  const flip = (t: Tab, key: string, value: boolean, by: string): Result<TabView> => {
    if (!isPolicyKey(key)) return { ok: false, reason: `"${key}" is not a switch` };
    const all = store.policies();
    store.savePolicies({ ...all, [t.id]: { ...all[t.id], [key]: value } });
    const said = SAID[key](t.name, value);
    event(
      t.id,
      by === "the person" ? said : `${t.name} changed a setting: ${said}`,
      `set_policy ${key}=${value} by ${by}`,
    );
    return { ok: true, value: view(t) };
  };

  return {
    tabs: () => [...tabs.values()].map(view),

    join(platform, client) {
      if (!(PLATFORMS as readonly string[]).includes(platform)) {
        return {
          ok: false,
          reason: `"${platform}" is not a platform. Join as one of: ${PLATFORMS.join(", ")}.`,
        };
      }
      const t = tabs.get(platform) as Tab;
      if (live(t.session)) {
        t.refusedAt = now();
        event(
          t.id,
          `Another ${t.name} session tried to connect. Only one can be connected at a time.`,
          "join refused: a live session holds this tab; it frees after the person's hand_over or when that session's lease lapses",
        );
        return {
          ok: false,
          reason:
            `The ${t.name} tab already has a live session, and only one ${t.name} session may be joined at a time. ` +
            `Ask the person to press Hand over in the ${t.name} tab of GlassEngine, then call join again. ` +
            "The tab also frees itself about two minutes after that session stops waiting for messages.",
        };
      }
      if (t.session) end(t, "its lease lapsed and a new session joined");
      const id = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("hex");
      t.session = { id, joinedAt: now(), lastSeen: now(), waiting: 0, client };
      t.refusedAt = undefined;
      event(
        t.id,
        `${t.name} connected${client ? ` (${client})` : ""}.`,
        `join: new session, lease ${config.leaseSeconds}s renewed by each wait_for_message`,
      );
      return {
        ok: true,
        value: {
          session: id,
          tab: t.id,
          leaseSeconds: config.leaseSeconds,
          pending: t.pending.length,
        },
      };
    },

    async wait(sessionId, seconds, signal) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      const { tab: t, session: s } = found.value;
      s.waiting += 1;
      s.lastSeen = now();
      onChange();
      const deadline = Date.now() + Math.max(0, seconds) * 1000;
      try {
        while (true) {
          const outcome = settled(t, s, deadline, signal);
          if (outcome) return outcome;
          await woken(t, deadline - Date.now(), signal);
        }
      } finally {
        s.waiting -= 1;
        s.lastSeen = now();
        onChange();
      }
    },

    reply(sessionId, text) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      found.value.session.lastSeen = now();
      return {
        ok: true,
        value: record({ tab: found.value.tab.id, from: "engine", kind: "reply", text }),
      };
    },

    setStatus(sessionId, state, note) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      const { tab: t, session: s } = found.value;
      s.lastSeen = now();
      t.state = state;
      return {
        ok: true,
        value: record({ tab: t.id, from: "engine", kind: "status", state, text: note ?? state }),
      };
    },

    release(sessionId) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      const t = found.value.tab;
      end(t, "it released the tab");
      event(t.id, `${t.name} disconnected.`, "the joined session called release");
      return { ok: true, value: view(t) };
    },

    sessionTranscript(sessionId, limit, since) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      const id = found.value.tab.id;
      const rows = store.transcript().filter((e) => e.tab === id && (!since || e.at > since));
      return { ok: true, value: rows.slice(-limit) };
    },

    async send(id, text, by, waitSeconds = 0) {
      const found = find(id);
      if (!found.ok) return found;
      const t = found.value;
      if (by === "nimblebrain" && !policyOf(t).agentsMaySend) {
        const reason = `agents may not post in the ${t.name} tab (agentsMaySend is off); the person can switch it on in GlassEngine`;
        event(
          t.id,
          "NimbleBrain's agent tried to send a message here, but that is turned off.",
          `send_message refused: ${reason}`,
        );
        return { ok: false, reason };
      }
      return t.engine ? toEngine(t, t.engine, text, by, waitSeconds) : toSession(t, text, by);
    },

    transcript(id, limit, since) {
      let visible: Set<string>;
      if (id) {
        const found = find(id);
        if (!found.ok) return found;
        if (!policyOf(found.value).agentsMayRead) {
          return { ok: false, reason: `the ${found.value.name} tab is hidden from agents` };
        }
        visible = new Set([id]);
      } else {
        visible = new Set(
          [...tabs.values()].filter((t) => policyOf(t).agentsMayRead).map((t) => t.id),
        );
      }
      const rows = store.transcript().filter((e) => visible.has(e.tab) && (!since || e.at > since));
      return { ok: true, value: rows.slice(-limit) };
    },

    snapshot(limit) {
      return { tabs: [...tabs.values()].map(view), transcript: store.transcript().slice(-limit) };
    },

    pause(id) {
      const found = find(id);
      if (!found.ok) return found;
      const t = found.value;
      if (!t.paused) {
        t.paused = true;
        event(
          t.id,
          "Paused. New messages will wait until the tab is resumed.",
          "pause: wait_for_message returns no messages until resume",
        );
      }
      return { ok: true, value: view(t) };
    },

    resume(id) {
      const found = find(id);
      if (!found.ok) return found;
      const t = found.value;
      if (t.paused) {
        t.paused = false;
        event(t.id, "Resumed.", "resume: held messages go out on the next wait_for_message");
        wake(t);
      }
      return { ok: true, value: view(t) };
    },

    releaseTab(id) {
      const found = find(id);
      if (!found.ok) return found;
      const t = found.value;
      if (!t.session) return { ok: false, reason: `${t.name} is not connected.` };
      end(t, "the person released the tab");
      event(t.id, `You disconnected ${t.name}.`, "release_tab by the person ended the session");
      return { ok: true, value: view(t) };
    },

    handOver(id) {
      const found = find(id);
      if (!found.ok) return found;
      const t = found.value;
      if (!t.session) return { ok: false, reason: `${t.name} is not connected.` };
      end(t, "the person handed the tab over to another session");
      t.refusedAt = undefined;
      event(
        t.id,
        `You handed this tab over. The next ${t.name} session to connect takes it.`,
        "hand_over by the person ended the session; the next join succeeds",
      );
      return { ok: true, value: view(t) };
    },

    setPolicy: (id, key, value) => {
      const found = find(id);
      return found.ok ? flip(found.value, key, value, "the person") : found;
    },

    setOwnPolicy(sessionId, key, value) {
      const found = bySession(sessionId);
      if (!found.ok) return found;
      const t = found.value.tab;
      if (!policyOf(t).joinedMayChangePolicy) {
        return {
          ok: false,
          reason: `the person has not allowed the joined agent to change the ${t.name} tab's switches`,
        };
      }
      return flip(t, key, value, "the joined agent");
    },
  };
}

/** What each switch change says on screen, in a person's words. */
const SAID: Record<PolicyKey, (name: string, on: boolean) => string> = {
  agentsMaySend: (_, on) =>
    `NimbleBrain's agent can ${on ? "now" : "no longer"} send messages here.`,
  agentsMayRead: (_, on) => `NimbleBrain's agent can ${on ? "now" : "no longer"} read this chat.`,
  joinedMayChangePolicy: (name, on) =>
    `${name} can ${on ? "now" : "no longer"} change these settings.`,
};

/** Resolve when the tab wakes its waiters, the time is up, or the request is aborted. */
function woken(t: Tab, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      t.waiters.delete(done);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    t.waiters.add(done);
    signal?.addEventListener("abort", done, { once: true });
  });
}

function blank(id: string, name: string): Tab {
  return { id, name, paused: false, pending: [], waiters: new Set() };
}
