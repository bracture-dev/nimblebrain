# Troubleshooting

Find the symptom, apply the fix, rerun the step. The log of a background start is
`<NB_DIR>/.nimblebrain-worktree/dev.log`; lines are prefixed `[dev]`, `[api]` and `[web]`.

## Install and start

**`git clone` fails with `cannot copy ... hooks/...sample: Operation not permitted`.** The agent's
sandbox blocked the write. Ask the person to approve running the clone outside the sandbox, and
retry once into an empty folder.

**`Failed to build tasks UI (bun install)` on the first `bun run dev`.** The launcher's own unfrozen
install was blocked or failed (for example by a sandbox or the network). Run `scripts/install.sh <NB_DIR>`, which installs from the lockfiles
and builds the app UIs, then start again.

**`[dev] API did not become ready` / `API failed to become ready within 30s`.** Usually a `PORT`
variable exported in the shell: it overrides the API port, so the launcher waits on the wrong one.
`unset PORT` (the examples use `PORT` too) or start with `scripts/start.sh`, which clears it. If
`PORT` is not set, read the `[api]` lines in the log for the real error.

**Port already in use, or the web page moves to another port while the API dies.** Another
NimbleBrain, or a second start of this one, holds the ports. `scripts/doctor.sh --api <API> --web
<WEB>` says which. If `/v1/health` answers there, it is already running: use it, or stop it first.
Otherwise choose another free pair and update `.env`.

**`bun run dev:api` fails with `Config file not found`.** That script expects a config this setup
does not create. Use `bun run dev:worktree` (or `scripts/start.sh`).

**A doc mentions `bun run dev:tui` or another script that does not exist.** `package.json`
`scripts` is the source of truth. The local product is the web page plus the API.

**Bun version warning from `doctor.sh`.** Match `packageManager` in `package.json`; see
[prerequisites.md](prerequisites.md).

**`bun run verify` fails right after cloning.** Not needed for running NimbleBrain. It is the
contributor check and needs `web/` and every `src/platform/*/ui` installed first (`install.sh`
does that).

## Running

**Health is ok but chat answers with an error.** `/v1/health` does not need a key. Check the key
line is filled (`grep -cE '^ANTHROPIC_API_KEY=.+' <NB_DIR>/.env` prints `1`), then restart: the key
is read only at start. For a non-Anthropic provider, check the `providers` and `models` entries
([choices.md](choices.md)).

**A changed key still is not used, or a hand edit to `nimblebrain.json` or `workspace.json` has no
effect.** Restart. Touching a file does not reload configuration.

**The page signs in as "Developer" and a hosted NimbleBrain login does not work.** Expected. The
local copy uses the dev identity provider: one local developer. Hosted accounts and data do
not exist here. A real sign-in provider is configured in `instance.json`; see the docs page on
`instance.json`.

**`http://127.0.0.1:<WEB>` does not load but `http://localhost:<WEB>` does.** The web dev server
listens on `localhost`. Use `http://localhost:<WEB>` for the web page.

**The MCP URL in the web page shows port 27247 while the API runs on another port.** Set
`NB_PUBLIC_ORIGIN=http://localhost:<API>` in `.env` and restart. The URL printed by
`scripts/verify.sh` is always built from the real port.

**An app frame stays blank, or shows "UI not built".** Rebuild the app UIs with `install.sh`, then
hard-refresh the browser (Cmd+Shift+R or Ctrl+Shift+R).

## Agent connection

**Claude Code does not show the nimblebrain tools.** New servers appear only in a new session.
Check `claude mcp get nimblebrain` from the same folder you added it in (scope `local` is per
folder). If it says the server failed, check the API is running and the URL has the right port
and workspace id.

**Claude Code says `Not logged in`.** Run `/login` in Claude Code first. This is the agent's own
account, separate from NimbleBrain's provider key.

**Codex: `-32022` / `Unsupported protocol version`.** Enable the `mcp_2026_07_28` feature
([connect-agents.md](connect-agents.md)). If it is enabled and tools are still missing, look for a
project `.codex/config.toml` that disables the server.

**A connection check from the agent fails with `Operation not permitted` or connection refused,
while the browser loads the page.** The agent's sandbox blocks local network access. Ask the
person to approve rerunning the check outside the sandbox, or to run it in their own terminal.

**A hosted chat app (claude.ai, ChatGPT, a desktop chat app) cannot add the local URL.** Those
connectors run from the vendor's servers and cannot reach this machine. Use Claude Code, Codex or
another local client.

## Connectors and apps

**A connector added by URL shows as installed, but agents do not see its tools.** Open the
Connectors page and click Connect on it, then check again.

**A local connector at `http://127.0.0.1:<port>/mcp` is refused.** Local addresses need the
development switch `allowInsecureRemotes: true` in `<NB_DIR>/.nimblebrain-worktree/nimblebrain.json`,
then a restart. Use it on a local dev instance only. The showcase and GlassEngine READMEs give the
exact steps.

**A sidebar entry added by hand does not appear.** Restart after editing `workspace.json`, and
check the placement's `ui://` resource URI has at least two segments (`ui://<server>/<view>`).
