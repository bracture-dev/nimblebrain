import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Policy } from "./policy.ts";

/**
 * One line in a tab's chat.
 *
 * `from` says who wrote it: the person at the GlassEngine screen, an agent in
 * the NimbleBrain workspace, the engine (the joined agent, or a configured
 * engine's reply), or GlassEngine itself (joins, refusals, pauses, switches).
 */
export interface Entry {
  id: string;
  at: string;
  tab: string;
  from: "person" | "nimblebrain" | "engine" | "glass";
  kind: "message" | "reply" | "status" | "event" | "error";
  text: string;
  /** For a status line: the state the engine says it is in. */
  state?: string;
}

/** How many lines are kept in memory and read back at start. */
const KEEP = 2000;

export interface Store {
  transcript(): readonly Entry[];
  append(entry: Omit<Entry, "id" | "at">): Entry;
  policies(): Record<string, Partial<Policy>>;
  savePolicies(policies: Record<string, Partial<Policy>>): void;
}

/** The chat goes to `transcript.jsonl` and switches set on screen to `policy.json`, both under `dir`. */
export function openStore(dir: string): Store {
  mkdirSync(dir, { recursive: true });
  const transcriptPath = join(dir, "transcript.jsonl");
  const policyPath = join(dir, "policy.json");
  const log: Entry[] = existsSync(transcriptPath) ? readTranscript(transcriptPath) : [];
  let seq = log.length;
  let policies: Record<string, Partial<Policy>> = existsSync(policyPath)
    ? (JSON.parse(readFileSync(policyPath, "utf8")) as Record<string, Partial<Policy>>)
    : {};

  return {
    transcript: () => log,
    append(entry) {
      seq += 1;
      const full: Entry = {
        id: `e${Date.now().toString(36)}${seq.toString(36)}`,
        at: new Date().toISOString(),
        ...entry,
      };
      log.push(full);
      if (log.length > KEEP) log.splice(0, log.length - KEEP);
      appendFileSync(transcriptPath, `${JSON.stringify(full)}\n`);
      return full;
    },
    policies: () => policies,
    savePolicies(next) {
      policies = next;
      writeFileSync(policyPath, `${JSON.stringify(next, null, 2)}\n`);
    },
  };
}

function readTranscript(path: string): Entry[] {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).slice(-KEEP);
  const out: Entry[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as Entry);
    } catch {
      // A line cut short by a crash is skipped; the rest of the chat still loads.
    }
  }
  return out;
}
