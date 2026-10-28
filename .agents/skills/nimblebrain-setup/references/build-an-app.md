# Build your first local app

After local setup, ask the coding agent to make a separate app from the
[showcase](../../../../examples/showcase/README.md). Keep using this install's `NB_DIR`, `SCRIPTS`,
work directory, workspace id and API/web ports. No model key is needed for the app's tools or UI.

## Copy the example

Choose an unused folder, connector name, route and loopback port. This guide uses `my-board` and
27282. Check the port is free; leave the showcase and GlassEngine running.

From the NimbleBrain checkout, copy only the committed template, excluding installed dependencies
and local files. `mkdir` refuses an existing destination, including a symlink:

```bash
(
  set -euo pipefail
  NB_DIR=${NB_DIR:-$HOME/nimblebrain}
  APP_DIR="$NB_DIR/examples/my-board"
  mkdir "$APP_DIR"
  git -C "$NB_DIR" archive HEAD:examples/showcase | tar -x -C "$APP_DIR"
  cd "$APP_DIR"
  bun install --frozen-lockfile --ignore-scripts
)
```

## Give it its own identity

Edit only the copy:

- In [src/mcp.ts](../../../../examples/showcase/src/mcp.ts), change the server name to `my-board`
  and every placement route to `my-board`, `my-board/tour` or `my-board/table`. Give them clear
  labels. Update the server instructions and copied skill to describe your app.
  Keep the skill's frontmatter `name` matched to its folder name; changing its description is enough.
- In [src/ui.ts](../../../../examples/showcase/src/ui.ts), change `pageUri` to produce
  `ui://my-board/<page>`.
- In [ui/app.js](../../../../examples/showcase/ui/app.js), change the `Synapse.connect` name and
  literal `ui://showcase/...` links to the new identity. Keep the `showcase-page` meta-tag name
  matched between `src/ui.ts` and `ui/app.js`; it can stay as it is.

The connector's `serverName` becomes the workspace tool prefix: `my-board__add_card`. A placement's
`resourceUri` must match a registered page; its route is the address inside NimbleBrain. A tool's
`_meta.ui.resourceUri` chooses the page shown with its result. These are different jobs; follow
`pageUri`, `PLACEMENTS` and `registerResource` in the source.

## Change one tool and one view

Start small: add a `category` field to `add_card`, keep it in
[src/board.ts](../../../../examples/showcase/src/board.ts), and show it in the Board panel in
`ui/app.js`. Update the Zod input/output schemas in `src/mcp.ts` to match.

Keep annotations accurate: `readOnlyHint` describes whether a tool writes, `destructiveHint`
marks destructive behavior, and `idempotentHint` says repeating the call has the same effect.
App-only tools use `_meta.ui.visibility`; see the existing examples in `src/mcp.ts`.

[src/server.ts](../../../../examples/showcase/src/server.ts) binds to `127.0.0.1` and sends change
notices after board writes. `src/ui.ts` inlines HTML, CSS, JavaScript and Synapse into one MCP App
document. There is no UI build step. The [MCP Apps overview](../../../../docs/src/content/docs/concepts/mcp-apps.mdx)
explains how the host renders it.

Update the copied tests for the new identity and field. Run from the new folder:

```bash
bun test
PORT=27282 SHOWCASE_TOKEN=local-my-board bun run start
```

## Add it beside the existing apps

Follow the showcase README's **Connect to NimbleBrain** section with this install's values. Back
up both configuration files. Stop NimbleBrain with
`bash "$SCRIPTS/stop.sh" "$NB_DIR" --keep-examples` while editing. Preserve other settings and
connector entries. Local onboarding already enables
`allowInsecureRemotes`; reuse it.

Append one connector with URL `http://127.0.0.1:27282/mcp`, `serverName` set to `my-board`, the
matching token and renamed placements.
Start your app before restarting NimbleBrain. Do not rerun setup to register it. The log should
show `my-board ready` alongside the existing connectors.

## Verify and report

- Run `bash "$SCRIPTS/nb-tool.sh" --dir "$NB_DIR" --list`. Confirm `my-board__` tools appear
  alongside the original connector prefixes.
- Use the same helper with `my-board__add_card '{"title":"First item","category":"sample"}'`,
  then `my-board__list_cards '{}'`. Confirm the stored category returns.
- Adapt the README's resource `curl` check to your API port and `/apps/my-board/resources/app`.
  Require HTTP success and the app's HTML.
- **Browser check:** open the new app under Apps. Confirm the field renders, a UI write appears
  through `list_cards`, and a tool write updates the screen. Reopen Showcase and GlassEngine and
  confirm both still work.

Report command results separately from browser observations. Say when a browser check did not
run. The copied board is in memory: a restart clears its sample changes.
