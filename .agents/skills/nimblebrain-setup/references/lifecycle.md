# Stop, restart, update, uninstall

All commands assume `NB_DIR` is the checkout and `SCRIPTS=$NB_DIR/.agents/skills/nimblebrain-setup/scripts`.

## Stop

- Started with `scripts/start.sh`: run `bash "$SCRIPTS/stop.sh" "$NB_DIR"`. It stops the example
  apps first. Then it stops the launcher, the API and the web server together. If they have not
  exited after 15 seconds, it force-stops them.
- Started in a terminal with `bun run dev:worktree`: Ctrl+C in that terminal.

## Restart

Restart after you change `.env` (key, ports), `nimblebrain.json`, or a connector entry in
`workspace.json` by hand. Connectors added from the web page apply without a restart.

```bash
bash "$SCRIPTS/stop.sh" "$NB_DIR"
bash "$SCRIPTS/setup.sh" --agent claude --dir "$NB_DIR"   # or --agent codex
```

`setup.sh` reuses everything already in place, starts the examples and then NimbleBrain, and
checks the result. Run by hand, the order is `examples.sh start`, `start.sh`, `verify.sh`.

`stop.sh` stops the examples too, and `start.sh` does not start them. Start them before
NimbleBrain, because NimbleBrain connects to its connectors as it starts.

The API also reloads by itself when files under `src/` change (it runs under `bun --watch`).

## Open it again later

`http://localhost:<WEB>`. If nothing answers, it is not running: `bash "$SCRIPTS/start.sh" "$NB_DIR"`.

## Uninstall what setup added

`bash "$SCRIPTS/uninstall.sh" "$NB_DIR"` stops everything and removes exactly what `setup.sh`
recorded in `onboarding.json`: the agents' `nimblebrain` MCP entries (only while they still point at
this install), the Codex feature if setup turned it on, and each agent's nimblebrain plugin and
marketplace from the recorded source. Add `--delete-key` to also delete the saved Anthropic key
(it asks first). The checkout folder stays.

## Update

The checkout stays stock, so updating is a fast-forward:

```bash
bash "$SCRIPTS/stop.sh" "$NB_DIR"
git -C "$NB_DIR" pull --ff-only
bash "$SCRIPTS/install.sh" "$NB_DIR"
bash "$SCRIPTS/examples.sh" start "$NB_DIR"
bash "$SCRIPTS/start.sh" "$NB_DIR" && bash "$SCRIPTS/verify.sh" <API> <WEB>
```

If `pull --ff-only` refuses, the checkout has local commits or edits. Show the person
`git -C "$NB_DIR" status` before doing anything else. If the Bun pin in `package.json` moved,
`scripts/doctor.sh` says so; match it before `install.sh`. After an update, recheck the agent
connection with `claude mcp get nimblebrain`.

## Back up

Everything worth keeping is `<NB_DIR>/.nimblebrain-worktree/`, `<NB_DIR>/examples/glassengine/.glassengine/` (GlassEngine's transcript and token) and `.env`.
Copy that folder while NimbleBrain is stopped.

## Uninstall

Confirm with the person first; this deletes their local conversations and files.

1. `bash "$SCRIPTS/stop.sh" "$NB_DIR"`.
2. Remove the agent's workspace entry: `claude mcp remove nimblebrain` (with the `--scope` used)
   or `codex mcp remove nimblebrain`. On Codex, also run
   `codex features disable mcp_2026_07_28` if nothing else uses it.
3. Remove the showcase and GlassEngine entries. With a plugin, uninstall it:
   `claude plugin uninstall nimblebrain@nimblebrain` or
   `codex plugin remove nimblebrain@nimblebrain`. Without one, run
   `claude mcp remove glassengine --scope user` and `claude mcp remove showcase --scope user`, or
   delete the two `[mcp_servers]` tables from `~/.codex/config.toml`.
4. Delete `NB_DIR`. It holds the code, `.env`, all state, and the examples and their logs.
5. If telemetry was left on, NimbleBrain also wrote `~/.nimblebrain/.telemetry-id`. Delete
   `~/.nimblebrain` only if no other NimbleBrain install on this machine uses it (plain
   `bun run dev` keeps its state there).
6. Tools installed for this (Bun, Node.js) stay; remove them with the same package manager if the
   person wants.
