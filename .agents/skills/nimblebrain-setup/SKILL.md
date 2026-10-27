---
name: nimblebrain-setup
description: Install and run NimbleBrain locally from source, connect the person's coding agent (Claude Code, Codex or any MCP client) to the local workspace MCP endpoint, then offer the showcase tour or GlassEngine for bringing their own agent. Use when someone asks to set up, install, run, try or get started with NimbleBrain locally, or to connect their agent to a local NimbleBrain.
license: Apache-2.0
compatibility: macOS or Linux with git, Bun (the version pinned in package.json), Node.js 22+ and curl. Docker is an alternative route.
---

# NimbleBrain local setup

You are installing stock NimbleBrain on the person's machine and connecting their agent to it.
Work in the open: say what you are about to run, run it, show what happened.

## Ground rules

- Show the plan and get an OK before you change anything. Offer every install on the machine
  (git, Bun, Node.js) as a command the person approves; never install one silently.
- Never ask for, read, print or store a model provider API key. The person types it into the
  checkout's gitignored `.env` themselves. You may only check that the line is non-empty.
- Dev mode has no login: whoever reaches the instance is its admin, "Developer". Run it only on a
  machine you trust, and do not expose it beyond that machine.
- Keep the checkout stock. All runtime state stays inside it, in `.nimblebrain-worktree/`.
- Prefer the bundled scripts over retyping their commands. They print what they do.
- If a command fails with `Operation not permitted` inside your sandbox (`git clone`, a port check,
  `curl` to localhost), ask the person to let you rerun that one command outside the sandbox.
- Keep a short list of anything that confused you or the person. Step 10 uses it.

Names used below: `NB_DIR` is the checkout folder, `API` and `WEB` are the two ports, `WS` is the
workspace id, `SKILL_DIR` is this skill's folder. After the clone, the skill is also at
`$NB_DIR/.agents/skills/nimblebrain-setup`, so its scripts are available from there.

## 1. Plan

Show this, adjusted to what the person asked for, and wait for an OK:

1. Check git, Bun, Node.js and two free ports; offer to install anything missing.
2. Ask a few choices: folder, ports, model provider, telemetry, which agent to connect.
3. Clone NimbleBrain, install its dependencies from the lockfiles, build the built-in app UIs.
4. You add your provider key to `.env` yourself; I never see it.
5. Start NimbleBrain, check the API, the web page and the workspace MCP endpoint.
6. Connect your coding agent to the workspace.
7. Optional: the showcase tour, or bring your own agent with GlassEngine.
8. A summary of what changed, and how to stop, restart and uninstall.

## 2. Prerequisites

Run `bash "$SKILL_DIR/scripts/doctor.sh" --api 27271 --web 27270`. Without the scripts, run
`git --version`, `bun --version`, `node --version`, `curl --version`. Required: git, Bun (match
`packageManager` in `package.json`, currently `bun@1.4.3`), Node.js 22+ (the web dev server runs
on it), curl. For anything missing, offer the matching command from
[references/prerequisites.md](references/prerequisites.md) and wait for a yes.

## 3. Choices

Ask these in one message, each with its default, and accept "defaults" as an answer. Details and
consequences: [references/choices.md](references/choices.md).

| Choice | Default |
|---|---|
| Folder for the checkout | `~/nimblebrain` (any real folder, not a symlink) |
| Route | From source (Docker: [references/docker.md](references/docker.md)) |
| Ports, API and web | 27271 and 27270 |
| Model provider | Anthropic (`ANTHROPIC_API_KEY`); others need two config lines |
| Telemetry | Off (`NB_TELEMETRY_DISABLED=1`) |
| Agent to connect | The one running this skill; also Codex or another MCP client |
| Afterwards | Showcase tour, GlassEngine, or nothing yet |

Say up front: this is a separate local copy. A hosted NimbleBrain account does not sign in here,
and nothing syncs between them. Chat needs the person's own provider key; installing and
verifying do not.

## 4. Clone and install

```bash
git clone https://github.com/NimbleBrainInc/nimblebrain.git "$NB_DIR"
bash "$NB_DIR/.agents/skills/nimblebrain-setup/scripts/install.sh" "$NB_DIR"
```

`install.sh` installs root, `web/` and each `src/platform/*/ui` from their lockfiles with lifecycle
scripts off, then builds the app UIs. It takes about a minute and writes only inside `NB_DIR`.

## 5. Settings and the key

Create `$NB_DIR/.env` only if it does not exist. If it exists, do not open it; ask the person
whether it already holds what is below. Write the ports they chose:

```bash
cat > "$NB_DIR/.env" <<'EOF'
# NimbleBrain local settings. This file is gitignored. Restart after editing.
ANTHROPIC_API_KEY=
NB_API_PORT=27271
NB_WEB_PORT=27270
NB_PUBLIC_ORIGIN=http://localhost:27271
NB_TELEMETRY_DISABLED=1
EOF
```

Then ask the person to open `$NB_DIR/.env` in their editor and paste their key after
`ANTHROPIC_API_KEY=` (or the variable for their provider), and to tell you when it is saved. Check
without printing: `grep -cE '^ANTHROPIC_API_KEY=.+' "$NB_DIR/.env"` prints `1` when filled. They
may skip this for now; everything except chat still works.

## 6. Start

```bash
bash "$NB_DIR/.agents/skills/nimblebrain-setup/scripts/start.sh" "$NB_DIR"
```

It refuses ports that something else holds, reports an instance that is already running, starts
`bun run dev:worktree` in the background with its log at `$NB_DIR/.nimblebrain-worktree/dev.log`,
and waits for the API and the web page. If the person prefers to watch it, they can run
`cd "$NB_DIR" && bun run dev:worktree` in their own terminal instead (Ctrl+C stops it).

## 7. Verify

```bash
bash "$NB_DIR/.agents/skills/nimblebrain-setup/scripts/verify.sh" 27271 27270
```

It checks `/v1/health`, the web page, finds the workspace id through `GET /v1/bootstrap`, lists the
workspace's tools over MCP and calls `nb__status`. Note the `MCP URL` line it prints. Then ask the
person to open `http://localhost:<WEB>` and confirm they see the workspace as "Developer". If a key
is set, a first chat such as "Call me <name>; my timezone is <zone>" proves the key and sets their
preferences; it spends a few tokens on their key, so it is their call.

## 8. Connect the coding agent

Use the `MCP URL` from step 7 and follow
[references/connect-agents.md](references/connect-agents.md): `claude mcp add --transport http
nimblebrain <MCP URL>` for Claude Code, `codex mcp add` plus one feature flag for Codex, and the
raw HTTP shape for anything else. The agent sees the new server in a new session, not the current
one. Ask the person to start one and try "list my NimbleBrain conversations".

## 9. Next step

Offer both, and do the one they pick:

- **Showcase tour** (`examples/showcase/`): a NimbleBrain app that teaches NimbleBrain from inside
  it, with a guided tour and live sync between chat and screen. No keys or outside services.
- **GlassEngine** (`examples/glassengine/`): bring your own agent. NimbleBrain's controls are
  surfaced to that agent through the workspace MCP endpoint, and what the agent does in
  NimbleBrain shows up in a NimbleBrain app, where NimbleBrain's own agent and the person see it.

Each example's `README.md` has a "Run" section and a "Connect to NimbleBrain" section. Follow them
exactly, with this install's `NB_DIR`, `API` and `WS`. Run each example in its own folder; it
does not change the NimbleBrain checkout except the connector entry those steps describe.

## 10. Finish

Give a summary:

- What changed and where: `NB_DIR` (code, `.env`, all state in `.nimblebrain-worktree/`), the agent
  MCP entry, anything installed on the machine, any example folder.
- What you verified, with the command, and what you did not (for example chat, if no key yet).
- Stop, restart, update and uninstall, from [references/lifecycle.md](references/lifecycle.md).

When something fails, use [references/troubleshooting.md](references/troubleshooting.md) before
improvising.

## Improve this skill

Every new install is a test of this skill. At the end, if anything was confusing, slow or wrong:

1. Tell the person, in two or three lines, what tripped you and what would have helped.
2. Offer to draft the fix as an edit to this skill (the step, the reference, or a new
   troubleshooting entry), written for the next person's agent, with no personal details.
3. If they agree, make the edit in their checkout and show the diff. They decide whether to send
   it upstream as a pull request to NimbleBrainInc/nimblebrain; do not open one yourself.
