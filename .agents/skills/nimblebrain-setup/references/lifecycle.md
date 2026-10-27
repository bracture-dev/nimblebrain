# Stop, restart, update, uninstall

All commands assume `NB_DIR` is the checkout and `SCRIPTS=$NB_DIR/.agents/skills/nimblebrain-setup/scripts`.

## Stop

- Started with `scripts/start.sh`: `bash "$SCRIPTS/stop.sh" "$NB_DIR"`. It stops the launcher, the
  API and the web server together, and waits for both ports to close.
- Started in a terminal with `bun run dev:worktree`: Ctrl+C in that terminal.

## Restart

Needed after changing `.env` (key, ports), `nimblebrain.json`, or a connector entry edited by hand
in `workspace.json`. Connectors added from the web page apply without a restart.

```bash
bash "$SCRIPTS/stop.sh" "$NB_DIR" && bash "$SCRIPTS/start.sh" "$NB_DIR"
bash "$SCRIPTS/verify.sh" <API> <WEB>
```

The API also reloads by itself when files under `src/` change (it runs under `bun --watch`).

## Open it again later

`http://localhost:<WEB>`. If nothing answers, it is not running: `bash "$SCRIPTS/start.sh" "$NB_DIR"`.

## Update

The checkout stays stock, so updating is a fast-forward:

```bash
bash "$SCRIPTS/stop.sh" "$NB_DIR"
git -C "$NB_DIR" pull --ff-only
bash "$SCRIPTS/install.sh" "$NB_DIR"
bash "$SCRIPTS/start.sh" "$NB_DIR" && bash "$SCRIPTS/verify.sh" <API> <WEB>
```

If `pull --ff-only` refuses, the checkout has local commits or edits; show `git -C "$NB_DIR"
status` to the person before doing anything else. If the Bun pin in `package.json` moved,
`scripts/doctor.sh` says so; match it before `install.sh`. Recheck the agent connection
(`claude mcp get nimblebrain`) and any example after an update.

## Back up

Everything worth keeping is `<NB_DIR>/.nimblebrain-worktree/` (and `.env`, which holds the key).
Copy that folder while NimbleBrain is stopped.

## Uninstall

Confirm with the person first; this deletes their local conversations and files.

1. `bash "$SCRIPTS/stop.sh" "$NB_DIR"`.
2. Remove agent entries: `claude mcp remove nimblebrain` (with the `--scope` used),
   `codex mcp remove nimblebrain`, and `codex features disable mcp_2026_07_28` if nothing else
   uses it.
3. Remove any example connector and stop any example server (see that example's README).
4. Delete `NB_DIR`. It holds the code, `.env` and all state.
5. If telemetry was left on, NimbleBrain also wrote `~/.nimblebrain/.telemetry-id`. Delete
   `~/.nimblebrain` only if no other NimbleBrain install on this machine uses it (plain
   `bun run dev` keeps its state there).
6. Tools installed for this (Bun, Node.js) stay; remove them with the same package manager if the
   person wants.
