---
name: nimblebrain-setup
description: Use when someone asks to install, run or get started with NimbleBrain locally, or connect Claude Code or Codex to a local NimbleBrain. Safe to run again on an existing install.
license: Apache-2.0
compatibility: Tested on macOS with Claude Code and Codex. Needs git, Bun (the version pinned in package.json), Node.js 22+ and curl. Linux, Windows and other agents are next steps, not tested.
---

# NimbleBrain local setup

Bootstrap ends when NimbleBrain, the showcase and GlassEngine are running, their connectors work,
and the current Claude Code or Codex session has joined GlassEngine. Aim for 90 seconds when the
prerequisites and network are ready; downloads, approvals and session reloads can take longer.
Provider keys, preferences, the tour and chatting in GlassEngine are voluntary afterward.

Every address you use below is `127.0.0.1` or `localhost`. Work in the
open. Say what you are about to run, run it, and show what happened.

## Two ways in

| From a terminal | From a session already open |
|---|---|
| `curl -fsSL https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/install.sh \| bash` | Paste: **Set up NimbleBrain locally: follow https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/.agents/skills/nimblebrain-setup/SKILL.md** |
| Codex: add `-s -- --codex` after `bash` | Same line in Codex |

The terminal command shows the conflict report and plan, asks once, installs the plugin
(marketplace `nimblebrain`, plugin `nimblebrain`), and runs setup. It starts the agent only after
NimbleBrain, the showcase and GlassEngine are ready, then asks it to verify the connectors, join
GlassEngine and report ready.

When you were started from the pasted line instead, install the plugin first, with the same script
and no launch: `curl -fsSL https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/install.sh | NB_NO_LAUNCH=1 bash`
(add `-s -- --codex` on Codex; it may need to run outside your sandbox). Check whether this
session has loaded the plugin's tools. If it has not, explain the needed refresh in the plan:

- Claude Code: type `/reload-plugins` once setup has finished, which loads the plugin's servers
  into this session.
- Codex: use the client's plugin reload if it offers one, then verify the tools are available.
  In the CLI, quit and run `codex resume --last` to reopen this conversation with the plugin,
  the feature and the workspace door loaded.

Find `SCRIPTS` in the copy the agent keeps of the marketplace:
`claude plugin marketplace list --json` (`installLocation`) or `codex plugin marketplace list --json`
(`root`), plus `/.agents/skills/nimblebrain-setup/scripts`.

## Fast path

As few human steps as possible: one plan, one yes. An approved launch already covers that plan.
For a needed choice, use the agent's native question tool with clickable options (AskUserQuestion
in Claude Code); otherwise list the options in plain text.

1. **Check, read-only.** Run `bash "$SCRIPTS/check.sh" --agent <claude|codex>` (add any `--dir`,
   `--repo`, `--ref` or port the person or the launch prompt gave). It changes nothing and prints
   every conflict: what it found, what it expected, and what setup will do (reuse, skip or ask).
2. **Confirm any unapproved work.** Show this with the conflict lines and ask **Go ahead?** with
   **Yes** and **Change something**, unless the person already approved the same plan:

   > I will set up NimbleBrain in `~/nimblebrain` (NimbleBrain on localhost 27270, its API on
   > 27271, the showcase on 27280, GlassEngine on 27281; telemetry off). I install from the
   > lockfiles, start all three, add the showcase and GlassEngine to your workspace, connect this
   > agent to all three, and open GlassEngine for you.
   > The two connectors run on plain HTTP on localhost, so I set NimbleBrain's development setting
   > `allowInsecureRemotes`, which allows that for localhost addresses only. Anything already set up
   > is reused; I add, I never replace. NimbleBrain's own chat needs an Anthropic key, which you can
   > add after.

   For a missing tool, add its install command to the same plan, from
   [references/prerequisites.md](references/prerequisites.md) (Homebrew when `brew` exists). A
   password or sudo prompt the person types for that install is fine; the setup itself never uses
   sudo. On **Change something**, ask what, then go on
   with those values, or follow the step-by-step sections below.
3. **Run it.** `bash "$SCRIPTS/setup.sh" --agent <claude|codex>` with the same flags. It may need to
   run outside your sandbox (`git clone`, local ports). It clones or updates the checkout, installs
   dependencies once per commit, writes `.env` (it only adds missing lines), starts the showcase and
   GlassEngine and then NimbleBrain, adds both as workspace connectors, verifies, and adds this
   agent's `nimblebrain` workspace connection (Codex: and the `mcp_2026_07_28` feature).
   Native plugins require Showcase on 27280 and GlassEngine on 27281; custom example ports need
   manual native MCP configuration. API and web ports can differ. Bootstrap leaves Desktop files
   alone; offer a browser bookmark afterward if wanted.
   Exit 3 with a line starting `ASK:` means it found a conflict and stopped:
   show that line and ask. A second
   run on a finished install says "already set up" and goes straight to the hand-over. It leaves a
   recorded checkout where it is; `--update` fast-forwards it.
4. **Connect this session.** Open the `GlassEngine:` URL printed by `setup.sh`, then join as
   `claude` or `codex` with the plugin's tools and keep answering. Reuse this session's existing
   join; ask before taking a tab held by another session. Verify both connectors and the workspace
   connection. If tools need a reload, follow the client-specific step above and finish the join
   after it; do not call the bootstrap ready before then.
5. **Ready.** Give the short summary in step 12. The person can use the Showcase buttons to try
   the board or take the tour, open Profile → General for preferences, or talk in GlassEngine.
   No provider-key question, checklist or typed setup command is needed to finish bootstrap.

The person pastes one command (or one line), approves the plan and any tool prompts, and reloads
their session if needed. Claude Code's terminal command allows the plugin's own showcase and
GlassEngine tools for that session.

## Optional after bootstrap

Continue only when the person chooses it. The Showcase landing offers the board and tour;
Profile → General has clickable timezone, model and theme choices. Ask for a name only when they
want to set one. Keep current values unless they choose a change. For guided choices in a terminal,
use native questions. The showcase's `get_setup_checklist` opens its MCP App in clients that render
one; do not promise an embedded screen in a terminal client.

**Enable NimbleBrain's own chat.** When requested, ask **Do you have an Anthropic API key?** with
**Yes**, **Help me get one** and **Later**. The connected coding agent and sample board need no key.

- Yes: open a private Terminal window for the person to paste it, passing the path as an argument:
  `osascript -e 'on run argv' -e 'tell application "Terminal" to do script "bash " & quoted form of (item 1 of argv) & " --have-key"' -e 'end run' "$SCRIPTS/set-key.sh"`.
- Help me get one: use the same command without `--have-key`; it also opens the Anthropic Console.
- Later: leave it alone. They can run `bash "$SCRIPTS/set-key.sh"` in their terminal later.

These commands may need sandbox approval. If unavailable, give the person the command to run.
Never have them paste a key in chat. Check only `bash "$SCRIPTS/set-key.sh" --check`; after it
reports a saved key, restart NimbleBrain with `stop.sh "$NB_DIR" --keep-examples`, then
`start.sh "$NB_DIR"`. On Linux, the script saves it in `.env` with mode 600. A listed provider
alone does not prove chat has a key.

## Ground rules

- Show the plan and get an OK before you change anything. Add, never replace: an existing value
  that differs is a conflict to report, not something to fix.
- Offer every machine-wide install (git, Bun, Node.js) as a command the person approves. Never use
  a flag that skips a permission prompt. Never install anything silently.
- Never ask for, read, print or store a model provider API key. The person enters it in their own
  Terminal window with `set-key.sh`, or types it into `.env` themselves. You may only check that it
  is saved (`set-key.sh --check`).
- Dev mode has no login. The `dev` adapter signs every request in as one local developer. For a
  real identity provider, see the `instance.json` page in the docs.
- Keep the checkout stock. NimbleBrain's runtime state stays in `.nimblebrain-worktree/` and
  GlassEngine's in `examples/glassengine/.glassengine/`, both inside the checkout and gitignored.
- Use the bundled scripts instead of retyping their commands. They print what they do.
- If a command fails with `Operation not permitted` inside your sandbox (`git clone`, a port check,
  `curl` to localhost, `open`), ask the person to let you rerun that one command outside the
  sandbox.
- Note anything that confused you or the person. "Improve this skill" uses that list.

Names used below:

| Name | Meaning |
|---|---|
| `NB_DIR` | The checkout folder |
| `API`, `WEB` | The two ports: the API and the web page |
| `WS` | The workspace id |
| `WORK` | `$NB_DIR/.nimblebrain-worktree` |
| `SCRIPTS` | `$NB_DIR/.agents/skills/nimblebrain-setup/scripts` (also in this skill's own folder) |

The numbered sections below are the same work step by step, for **Change something**, for a
fast path that stopped, or for an agent without the scripts.

## 1. Plan

Show this plan, adjusted to what the person asked for, and wait for an OK:

1. Check git, Bun, Node.js and free ports. Offer to install anything missing.
2. Confirm any changed folder, ports, telemetry or agent choices.
3. Clone NimbleBrain, install dependencies from the lockfiles, build the app UIs.
4. Start NimbleBrain and check its API, web page and workspace MCP endpoint.
5. Start the showcase (127.0.0.1:27280) and GlassEngine (127.0.0.1:27281), and add both to your
   workspace as connectors.
6. Connect this agent to GlassEngine, the showcase and the workspace.
7. Join this session to its GlassEngine tab and report ready. Everything afterward is optional.

## 2. Prerequisites

Run `bash "$SCRIPTS/doctor.sh" --api 27271 --web 27270`. Without the scripts, run `git --version`,
`bun --version`, `node --version` and `curl --version`.

Required:

- git;
- Bun, matching `packageManager` in `package.json`;
- Node.js 22+ (the web dev server runs on it);
- curl.

For anything missing, offer the matching command from
[references/prerequisites.md](references/prerequisites.md) and wait for a yes. Tested on macOS.
Linux, Windows and other agents are next steps, not tested.

## 3. Choices

On the fast path these are assumed; ask only on **Change something**. Ask them in one message, each
with its default, and accept "defaults". Details:
[references/choices.md](references/choices.md).

| Choice | Default |
|---|---|
| Folder for the checkout | `~/nimblebrain` (any real folder, not a symlink) |
| Route | From source (Docker: [references/docker.md](references/docker.md); no examples there) |
| Ports, API and web | 27271 and 27270 |
| Telemetry | Off (`NB_TELEMETRY_DISABLED=1`) |
| Agent to connect | The one running this skill (Claude Code or Codex) |

Tell the person up front:

- This is a separate local copy. A hosted NimbleBrain account does not sign in here, and nothing
  syncs between the two.
- Chat inside NimbleBrain needs their own provider key. Installing, checking and connecting their
  agent do not.

## 4. Clone and install

```bash
git clone https://github.com/NimbleBrainInc/nimblebrain.git "$NB_DIR"
bash "$NB_DIR/.agents/skills/nimblebrain-setup/scripts/install.sh" "$NB_DIR"
```

`install.sh` installs the root, `web/` and each `src/platform/*/ui` from their lockfiles, with
install scripts turned off. Then it builds the app UIs inside `NB_DIR`.

## 5. Local settings

Create `$NB_DIR/.env` only if it does not exist (`setup.sh` does this, and on later runs only adds
missing non-secret lines). If it exists, do not open it. Ask whether it already holds the lines
below. Use the ports the person chose:

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

For a new `.env`, leave the key empty for bootstrap; preserve any existing key. NimbleBrain serves
its web page, workspace endpoint and connectors without one. The optional procedure above enables
its own chat afterward.

## 6. Start

```bash
bash "$SCRIPTS/start.sh" "$NB_DIR"
```

`start.sh` reuses an instance this checkout already runs and stops with `ASK:` on a port anything
else holds, naming a free pair. A key saved by `set-key.sh` goes only into the environment of
the NimbleBrain processes it starts (the launcher, the API and the web dev server).
Otherwise it starts `bun run dev:worktree` in the background, logs to `$WORK/dev.log`, and waits
for the API and the web page. The person can instead run `cd "$NB_DIR" && bun run dev:worktree` in
their own terminal.

## 7. Verify

```bash
bash "$SCRIPTS/verify.sh" 27271 27270
```

`verify.sh` checks `/v1/health` and the web page. It finds the workspace id through
`GET /v1/bootstrap`, lists the workspace's tools over MCP, and calls `nb__status`.

Note the `MCP URL` line. That is the workspace endpoint, `http://localhost:<API>/mcp/<WS>`. Ask the
person to open `http://localhost:<WEB>` and confirm they see the workspace.

## 8. Install and start the examples

The two example apps live in the checkout at `examples/showcase/` and `examples/glassengine/`.
Older checkouts do not have them. In that case, say so, skip steps 9 and 11, and in step 10 add only
the workspace connection.

```bash
bash "$SCRIPTS/examples.sh" start "$NB_DIR"
```

- The showcase installs from its own lockfile, with install scripts off.
- GlassEngine has no lockfile of its own. It runs on the checkout's root dependencies, so it starts
  without an install.
- The showcase listens on `127.0.0.1:27280`, with the bearer token `local-showcase` (see the Run
  section of its README).
- GlassEngine listens on `127.0.0.1:27281`.
- Logs go to `$WORK/examples/`. `examples.sh status "$NB_DIR"` shows what is listening.

If anything here differs from an example's own README, the README's "Run" section wins.

## 9. Add both as workspace connectors

Each example's README has a section, "Connect to NimbleBrain". Follow it with this install's
values: the API port, `WS` from step 7, and `WORK` as the work directory.

NimbleBrain reads these files only at start, so stop it first:
`bash "$SCRIPTS/stop.sh" "$NB_DIR"`. That stops the examples too.

1. In `$WORK/nimblebrain.json`, merge `{ "allowInsecureRemotes": true }`. This development setting
   lets the workspace reach connectors on localhost addresses over plain HTTP. Back the file up
   first (`connect.sh` keeps a copy under `.nimblebrain-worktree/backups/`).
2. In `$WORK/workspaces/$WS/workspace.json`, append two entries to `connectors`:
   - the showcase entry from its README (URL `http://127.0.0.1:27280/mcp`);
   - the GlassEngine entry from its README (URL `http://127.0.0.1:27281/mcp`), with the token
     GlassEngine printed in its log, `$WORK/examples/glassengine.log`.
3. Start the examples first (`examples.sh start`), then NimbleBrain (`start.sh`). NimbleBrain
   connects to each connector as it starts, so the examples must already be listening. Check that
   the API log (`$WORK/dev.log`) shows `✓ showcase ready` and `✓ glassengine ready`. Showcase and
   GlassEngine now appear under Apps.

Run `verify.sh` again. Its tool count now has a `showcase__` line and a `glassengine__` line.

`connect.sh "$NB_DIR"` does steps 1 to 3 in one go, and keeps the examples running while it
restarts NimbleBrain. One restart stays: NimbleBrain reads connectors only at start, and the
workspace id exists only after the first start.

## 10. Connect the agent

The agent needs three MCP connections:

| Connection | URL | Gives the agent |
|---|---|---|
| GlassEngine | `http://127.0.0.1:27281/mcp` | Its own chat tab inside NimbleBrain |
| Showcase | `http://127.0.0.1:27280/mcp`, header `Authorization: Bearer local-showcase` | The setup tour and checklist |
| Workspace | `http://localhost:<API>/mcp/<WS>` | NimbleBrain's own tools and every connector |

The plugin already carries the first two, so with it installed, add only the workspace. The
workspace id differs on every install, which is why no plugin can carry it.

**Claude Code** (tested on macOS). Ask the person, then run:

```bash
claude mcp add --transport http --scope user nimblebrain http://localhost:27271/mcp/$WS
# Without the plugin, also:
claude mcp add --transport http --scope user glassengine http://127.0.0.1:27281/mcp
claude mcp add --transport http --scope user showcase http://127.0.0.1:27280/mcp \
  --header "Authorization: Bearer local-showcase"
claude mcp list                # expect: Connected for each
```

User scope also reaches the Code tab of the Claude Code desktop app. A running session does not
pick up new servers, so the person starts a new one.

**Codex**. The showcase and GlassEngine work on Codex's default MCP version. The workspace speaks
only MCP `2026-07-28`. Codex supports that behind a feature it still marks as under development.
Name it in the plan, in these words: "This turns on a Codex feature still marked under
development, for every project on this machine. `codex features disable mcp_2026_07_28` turns it
off again." With a yes:

```bash
codex features enable mcp_2026_07_28
codex mcp add nimblebrain --url http://localhost:27271/mcp/$WS
codex mcp list
```

With the feature on, Codex saves the name, timezone and theme with NimbleBrain's own tools, the
same as Claude Code. Fallback only: with a no, Codex still reaches the showcase and GlassEngine,
and `scripts/nb-tool.sh` still reaches NimbleBrain's tools over plain HTTP.

Without the plugin, see [references/connect-agents.md](references/connect-agents.md) for the
showcase and GlassEngine entries. The same page shows the raw HTTP shape for any other MCP client.

## 11. Hand over

The approved plan covers this session's join. Open the GlassEngine URL from `setup.sh`, join as
`claude` or `codex` and keep answering. Reuse an existing join from this session; ask before taking
another session's tab. If the tools are not loaded, use the reload/resume instructions under
Two ways in, then finish the join. Report ready once the services, connectors and current session
are connected. The person can leave it there or choose a board, tour, preferences or conversation.

## 12. Finish

Give the person a short summary:

- What changed and where: `NB_DIR` (code, `.env`, state in `.nimblebrain-worktree/` and
  `examples/glassengine/.glassengine/`), the agent's MCP entries, the Desktop shortcut, and anything
  installed on the machine. `onboarding.json` lists what setup added.
- Every conflict `check.sh` reported, and what was done about it.
- What you checked, with the command, and what you did not (for example chat, if there is no key
  yet).
- How to stop, restart, update and uninstall: [references/lifecycle.md](references/lifecycle.md).

When something fails, check [references/troubleshooting.md](references/troubleshooting.md) first.

## Build an app after setup

When the person wants their own app, follow [Build your first local app](references/build-an-app.md).
It copies the showcase into a separate folder and adds it beside the existing apps, then checks
the tools and screen together.

## Improve this skill

Every install tests this skill. If anything was confusing, slow or wrong, tell the person in two or
three lines. Offer to draft the fix as an edit to this skill, with no personal details. They decide
whether to send it upstream as a pull request to NimbleBrainInc/nimblebrain. Do not open one
yourself.
