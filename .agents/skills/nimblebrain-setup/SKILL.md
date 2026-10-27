---
name: nimblebrain-setup
description: Install and run NimbleBrain locally from source, start its two bundled example apps (the showcase and GlassEngine), connect the person's coding agent to them, and hand the rest of setup to that agent working visibly through the showcase. Use when someone asks to set up, install, run, try or get started with NimbleBrain locally, or to connect their own agent to a local NimbleBrain.
license: Apache-2.0
compatibility: Tested on macOS with Claude Code. Needs git, Bun (the version pinned in package.json), Node.js 22+ and curl. Codex steps are experimental. Linux, Windows and other agents are next steps, not tested.
---

# NimbleBrain local setup

You install stock NimbleBrain on the person's machine, start the two example apps, connect their
agent, and then hand over: their own agent finishes setup on screen, through the showcase, while
the person watches. This skill covers only what must happen before NimbleBrain is running, and it
runs from the terminal. Everything is local: every address below is `127.0.0.1` or `localhost`.

Work in the open: say what you are about to run, run it, show what happened.

## Ground rules

- Show the plan and get an OK before you change anything. Offer every install on the machine
  (git, Bun, Node.js) as a command the person approves. Never use a flag that skips a permission
  prompt, and never install anything silently.
- Never ask for, read, print or store a model provider API key. The person types it into the
  checkout's gitignored `.env` themselves. You may only check that the line is non-empty.
- Dev mode has no login: the `dev` adapter signs every request in as one local developer. For a
  real identity provider, see the `instance.json` page in the docs.
- Keep the checkout stock. All runtime state stays inside it, in `.nimblebrain-worktree/`.
- Prefer the bundled scripts over retyping their commands. They print what they do.
- If a command fails with `Operation not permitted` inside your sandbox (`git clone`, a port check,
  `curl` to localhost), ask the person to let you rerun that one command outside the sandbox.
- Keep a short list of anything that confused you or the person. "Improve this skill" uses it.

Names: `NB_DIR` is the checkout folder, `API` and `WEB` are the two ports, `WS` is the workspace
id, `WORK` is `$NB_DIR/.nimblebrain-worktree`, `SCRIPTS` is
`$NB_DIR/.agents/skills/nimblebrain-setup/scripts` (also in this skill's own folder).

## 1. Plan

Show this, adjusted to what the person asked for, and wait for an OK:

1. Check git, Bun, Node.js and free ports; offer to install anything missing.
2. Ask a few choices: folder, ports, model provider, telemetry, which agent to connect.
3. Clone NimbleBrain, install dependencies from the lockfiles, build the app UIs.
4. You paste your provider key into `.env` yourself; I never see it.
5. Start NimbleBrain and verify its API, web page and workspace MCP endpoint.
6. Install and start the showcase (127.0.0.1:27280) and GlassEngine (127.0.0.1:27281), and add both
   to your workspace as connectors.
7. Write your agent's MCP configuration for GlassEngine and the workspace.
8. Hand over: open NimbleBrain next to your agent, say "join GlassEngine as claude and keep
   answering", and your agent runs the rest of setup through the showcase while you watch.

## 2. Prerequisites

Run `bash "$SCRIPTS/doctor.sh" --api 27271 --web 27270`. Without the scripts, run `git --version`,
`bun --version`, `node --version`, `curl --version`. Required: git, Bun (match `packageManager` in
`package.json`), Node.js 22+ (the web dev server runs on it), curl. For anything missing, offer the
matching command from [references/prerequisites.md](references/prerequisites.md) and wait for a
yes. Tested platform: macOS. Linux, Windows and other agents are next steps, not tested.

## 3. Choices

Ask these in one message, each with its default, and accept "defaults". Details:
[references/choices.md](references/choices.md).

| Choice | Default |
|---|---|
| Folder for the checkout | `~/nimblebrain` (any real folder, not a symlink) |
| Route | From source (Docker: [references/docker.md](references/docker.md); no examples there) |
| Ports, API and web | 27271 and 27270 |
| Model provider | Anthropic (`ANTHROPIC_API_KEY`); others need two config lines |
| Telemetry | Off (`NB_TELEMETRY_DISABLED=1`) |
| Agent to connect | Claude Code (tested). Codex is experimental |

Say up front: this is a separate local copy. A hosted NimbleBrain account does not sign in here and
nothing syncs between them. Chat inside NimbleBrain needs the person's own provider key; install,
verify and connecting their agent do not.

## 4. Clone and install

```bash
git clone https://github.com/NimbleBrainInc/nimblebrain.git "$NB_DIR"
bash "$NB_DIR/.agents/skills/nimblebrain-setup/scripts/install.sh" "$NB_DIR"
```

`install.sh` installs root, `web/` and each `src/platform/*/ui` from their lockfiles with lifecycle
scripts off, then builds the app UIs. About a minute; it writes only inside `NB_DIR`.

## 5. Settings and the key

Create `$NB_DIR/.env` only if it does not exist. If it exists, do not open it; ask whether it
already holds what is below. Write the ports they chose:

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

Ask the person to open `$NB_DIR/.env` in their editor, paste their key after `ANTHROPIC_API_KEY=`
(or the variable for their provider), and tell you when it is saved. Check without printing:
`grep -cE '^ANTHROPIC_API_KEY=.+' "$NB_DIR/.env"` prints `1` when filled. They may skip this for
now; everything except chat inside NimbleBrain still works.

## 6. Start

```bash
bash "$SCRIPTS/start.sh" "$NB_DIR"
```

It refuses ports something else holds, reports an instance already running, starts
`bun run dev:worktree` in the background with its log at `$WORK/dev.log`, and waits for the API and
web page. The person can instead run `cd "$NB_DIR" && bun run dev:worktree` in their own terminal.

## 7. Verify

```bash
bash "$SCRIPTS/verify.sh" 27271 27270
```

It checks `/v1/health` and the web page, finds the workspace id through `GET /v1/bootstrap`, lists
the workspace's tools over MCP and calls `nb__status`. Note the `MCP URL` line: that is the
workspace endpoint, `http://localhost:<API>/mcp/<WS>`. Ask the person to open `http://localhost:<WEB>`
and confirm they see the workspace.

## 8. Install and start the examples

The two example apps live in the checkout at `examples/showcase/` and `examples/glassengine/`. If
those folders are not there, this checkout predates them: say so, finish with NimbleBrain running,
and skip to step 12.

```bash
bash "$SCRIPTS/examples.sh" start "$NB_DIR"
```

It installs the showcase from its own lockfile with scripts off; GlassEngine has no lockfile of its
own and runs on the checkout's root dependencies, so it starts without an install. Both bind
`127.0.0.1`: the
showcase on `27280` (with the bearer token `local-showcase`, as its README's Run section shows) and
GlassEngine on `27281`. Logs: `$WORK/examples/`. Each example's `README.md` "Run" section is the
authority if anything differs; `examples.sh status "$NB_DIR"` shows what is listening.

## 9. Add both as workspace connectors

Follow each example's `README.md` section "Connect to NimbleBrain" with this install's values:
the API port, `WS` from step 7, and `WORK` as the work directory. In short, with NimbleBrain
stopped (`bash "$SCRIPTS/stop.sh" "$NB_DIR"` stops the examples too, so start them again after):

1. In `$WORK/nimblebrain.json`, merge `{ "allowInsecureRemotes": true }`, which lets the workspace
   reach connectors on this machine over plain HTTP. Back the file up first.
2. In `$WORK/workspaces/$WS/workspace.json`, append the showcase entry from its README (URL
   `http://127.0.0.1:27280/mcp`) and the GlassEngine entry from its README (URL
   `http://127.0.0.1:27281/mcp`, with the token GlassEngine printed in its log) to `connectors`.
3. Start NimbleBrain (`start.sh`), then the examples (`examples.sh start`), and check the API log
   (`$WORK/dev.log`) for both connectors ready. Showcase and GlassEngine appear under Apps.

Run `verify.sh` again. It now lists `showcase__` and `glassengine__` tools.

## 10. Write the agent's MCP configuration

Claude Code (tested on macOS). Ask the person, then run:

```bash
claude mcp add --transport http --scope user glassengine http://127.0.0.1:27281/mcp
claude mcp add --transport http --scope user nimblebrain http://localhost:27271/mcp/$WS
claude mcp get glassengine     # expect: Connected
claude mcp get nimblebrain
```

If GlassEngine's README says its endpoint needs a token header, add it with `--header` as that
README shows. User scope also feeds the Claude Code desktop app's Code tab. A running session does
not pick up new servers; the person starts a new one.

Codex is experimental: see [references/connect-agents.md](references/connect-agents.md). Any other
MCP client: the same file shows the raw HTTP shape. Linux, Windows and other agents are next steps.

## 11. Hand over

Tell the person, in these words:

1. Open NimbleBrain at `http://localhost:<WEB>` and go to the GlassEngine app.
2. Open a new Claude Code session (or the desktop Code tab) beside it. Allow the GlassEngine tools
   once so the loop runs without prompts.
3. Say: **join GlassEngine as claude and keep answering**.

From there their own Claude drives. It opens the showcase tour, runs the rest of setup (name,
preferences, connectors) with the showcase's tools, and every step shows on screen. You stop doing
terminal work unless something fails.

## 12. Finish

Summarize:

- What changed and where: `NB_DIR` (code, `.env`, all state in `.nimblebrain-worktree/`), the
  agent's MCP entries, anything installed on the machine.
- What you verified, with the command, and what you did not (for example chat, if no key yet).
- Stop, restart, update and uninstall: [references/lifecycle.md](references/lifecycle.md).

When something fails, use [references/troubleshooting.md](references/troubleshooting.md) first.

## Improve this skill

Every install tests this skill. If anything was confusing, slow or wrong, tell the person in two or
three lines, and offer to draft the fix as an edit to this skill, with no personal details. They
decide whether to send it upstream as a pull request to NimbleBrainInc/nimblebrain; do not open one
yourself.
