/**
 * The glass: what each side may do in one tab, set by the person on screen.
 *
 *   - `agentsMaySend`: agents working in the NimbleBrain workspace (NimbleBrain's
 *     own, or one connected to the workspace MCP endpoint) may post into this
 *     tab's chat. The person's send box always works.
 *   - `agentsMayRead`: those agents may read this tab's transcript. The person
 *     always sees it, and so does the agent joined to the tab.
 *   - `joinedMayChangePolicy`: the agent joined to this tab may change these
 *     switches for its own tab. Off until the person turns it on.
 */

export interface Policy {
  agentsMaySend: boolean;
  agentsMayRead: boolean;
  joinedMayChangePolicy: boolean;
}

export type PolicyKey = keyof Policy;

export const POLICY_KEYS = [
  "agentsMaySend",
  "agentsMayRead",
  "joinedMayChangePolicy",
] as const satisfies readonly PolicyKey[];

/**
 * A platform tab (an agent joins it from its own session) lets NimbleBrain's
 * agent talk to the joined agent from the start: the person invited that agent
 * by asking it to join. A tab backed by an engine from the config file runs a
 * program or calls an endpoint on every message, so agents may not send to it
 * until the person turns that on.
 */
export function defaultPolicy(kind: "session" | "engine"): Policy {
  return {
    agentsMaySend: kind === "session",
    agentsMayRead: true,
    joinedMayChangePolicy: false,
  };
}

export function mergePolicy(base: Policy, overrides: Partial<Policy> | undefined): Policy {
  return { ...base, ...overrides };
}

export function isPolicyKey(key: string): key is PolicyKey {
  return (POLICY_KEYS as readonly string[]).includes(key);
}
