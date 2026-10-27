# Showcase

A guided tour of what stock NimbleBrain does with an MCP App. It is one small MCP server that you run
on your own machine and add to a local workspace as a connector. Inside NimbleBrain it shows a
sidebar app with eight panels, each built on one capability and each naming the MCP tools it calls:

| Panel | What it shows | Tools it calls |
|---|---|---|
| Setup | A checklist your own agent drives: name, timezone, theme, model, GlassEngine, a first look at each panel | `get_setup_checklist`, `start_setup_step`, `complete_setup_step`, `skip_setup_step`, `show_panel`, `next_panel`, `reset_setup` |
| Tour | Ten steps through the panels below, with saved progress | `start_tour`, `save_tour_step` |
| Board | Tools behind a screen, and live sync: what the agent changes appears at once | `list_cards`, `add_card`, `move_card` |
| Table | Sorting, filtering and paging as arguments to one read tool | `list_cards` |
| Chart | An SVG chart drawn from a tool result in the host's theme | `board_stats` |
| Bridge | Requests only the host can serve: a notice, a chat message, context for the agent, a saved file, a link, a page opened by URI | `export_cards` |
| Server | Tools the agent sees, app-only tools, server instructions, the published skill | `describe_server` |
| Placements | One server filling a sidebar entry and two main-area pages | `describe_server` |

Everything works on a small task board of invented sample cards, held in memory. Restarting the
server or calling `reset_board` brings the starting cards back. Nothing here calls a model, so you
can try every panel without a provider key; asking the chat to drive the board needs one.

## Run

You need [Bun](https://bun.sh) 1.2 or newer.

```bash
cd examples/showcase
bun install
bun run start
```

The server listens on `http://127.0.0.1:27280/mcp`. Set `PORT` to use another port. Set
`SHOWCASE_TOKEN` to require `Authorization: Bearer <token>` on every request; the connector entry
below sends `local-showcase`, so start the server the same way:

```bash
SHOWCASE_TOKEN=local-showcase bun run start
```

## Connect to NimbleBrain

These steps add the showcase to a NimbleBrain running from source on the same machine, as described
in the repository's README. Dev mode has no login, so run it only on a machine you trust. The
commands assume the default ports, 27247 for the API and 27246 for the web app; use yours if you
changed them.

1. Find the workspace id and the work directory. The id is in the bootstrap response:

   ```bash
   curl -s http://localhost:27247/v1/bootstrap | grep -o '"id":"ws_[0-9a-f]*"'
   ```

   The work directory is `NB_WORK_DIR` if you set it, `.nimblebrain/` in the folder you start
   NimbleBrain from if that exists, `.nimblebrain-worktree/` in the checkout for
   `bun run dev:worktree`, and `~/.nimblebrain` otherwise.

2. Let the workspace reach a server on this machine over plain HTTP. In
   `<workDir>/nimblebrain.json`, add:

   ```json
   { "allowInsecureRemotes": true }
   ```

   This is a development switch; leave it off on a deployed instance.

3. Add the connector to `<workDir>/workspaces/<wsId>/workspace.json`, in its `connectors` array:

   ```json
   {
     "url": "http://127.0.0.1:27280/mcp",
     "serverName": "showcase",
     "transport": {
       "type": "streamable-http",
       "auth": { "type": "bearer", "token": "local-showcase" }
     },
     "ui": {
       "placements": [
         { "slot": "sidebar.apps", "resourceUri": "ui://showcase/app", "route": "showcase", "label": "Showcase", "priority": 20 },
         { "slot": "main", "resourceUri": "ui://showcase/tour", "route": "showcase/tour", "label": "Showcase tour" },
         { "slot": "main", "resourceUri": "ui://showcase/table", "route": "showcase/table", "label": "Showcase table" }
       ]
     }
   }
   ```

   NimbleBrain starts a URL connector when the workspace loads only if it has credentials for it,
   which is why the entry carries a bearer token. Tools reach the agent as `showcase__<tool>`.

4. Start the showcase with `SHOWCASE_TOKEN=local-showcase bun run start`, then restart NimbleBrain,
   which reads `workspace.json` when it starts. Its log then says
   `✓ showcase ready (16 tools, remote)`.

5. Open **Showcase** under Apps in the sidebar, or ask the chat to "start the showcase tour".

### Check it from a terminal

The workspace MCP endpoint lists the showcase's agent tools. App-only tools are not in the list:

```bash
WS=<your workspace id>
curl -s -X POST "http://localhost:27247/mcp/$WS" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/list' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientInfo":{"name":"curl","version":"0"},
        "io.modelcontextprotocol/clientCapabilities":{}}}}' \
  | grep -o '"name":"showcase__[a-z_]*"'
```

The page NimbleBrain renders in the sidebar comes from the same server:

```bash
curl -s "http://localhost:27247/v1/workspaces/$WS/apps/showcase/resources/app" | head -c 300
```

## Agent-driven setup

The Setup panel is a twelve-step checklist that your own agent works through while you watch. Each
step is a tool with a visible effect, and every button on the screen calls the same tool, so you can
take over at any point. The app records progress and moves the screen; NimbleBrain's own tools make
the changes.

| Step | What your agent does | NimbleBrain call |
|---|---|---|
| name, timezone, theme | Asks you, then saves it. Theme applies at once | `nb__set_preferences` |
| model (optional) | Asks which model new conversations use | `nb__set_preferences` with `model` |
| glassengine (optional) | Asks whether to connect your own agent in a tab | a second connector |
| first look, seven steps | Shows each panel and says what it demonstrates | `show_panel`, `next_panel` |

Connect your agent to the workspace endpoint, `http://localhost:27247/mcp/<wsId>` (use your own
port), and tell it: "set up NimbleBrain with the showcase". Its loop, per step:

1. `showcase__get_setup_checklist` for the steps, their statuses and the call to make.
2. `showcase__start_setup_step`, which marks the step in progress and shows its panel.
3. The change, for example `nb__set_preferences {"timezone": "Pacific/Honolulu"}`.
4. `showcase__complete_setup_step` with a short note, or `showcase__skip_setup_step` for an
   optional step. Notes show on screen, so they never hold keys or secrets.

Any MCP client works. A raw call through the endpoint looks like the one in "Check it from a
terminal"; swap in `tools/call` with `{"name": "showcase__start_setup_step", "arguments":
{"step": "name"}}`. Progress is held in memory and starts over when the showcase restarts.
Resetting it with `reset_setup` changes none of your NimbleBrain settings.

## Start the tour

From the chat, "start the showcase tour" makes the agent call `start_tour`, which shows the tour in
the chat answer. Without a provider key, open **Showcase** from the sidebar; the Setup panel is
first. A setup script or agent can point people at either.

## How it is built

| File | What it holds |
|---|---|
| `src/server.ts` | Entry point: the HTTP server on 127.0.0.1, and the change notice after every write |
| `src/mcp.ts` | Tools, `ui://` pages, the skills listing and the server instructions |
| `src/board.ts` | The sample board |
| `src/tour.ts` | The tour steps and progress |
| `src/setup.ts` | The setup checklist and which panel is showing |
| `src/skills.ts` | Serving `skills/` over the MCP skills extension |
| `src/ui.ts` | Builds each page: `ui/` plus NimbleBrain's Synapse SDK, inlined into one document |
| `ui/` | The page: plain HTML, CSS and JavaScript, no build step |
| `skills/showcase-guide/SKILL.md` | Guidance for NimbleBrain's agent, bound to this server's tools |

A few things worth knowing when you build your own app from it:

- **Live sync.** After any write, the server publishes `notifications/resources/list_changed`.
  NimbleBrain relays it to every open frame of the server, and the page re-reads what it shows. The
  page never re-renders after its own write; the notice does that for every open copy.
- **App-only tools.** A tool with `_meta.ui.visibility: ["app"]` can be called by the page, but
  NimbleBrain leaves it out of every tool list an agent sees and refuses an agent that calls it.
- **Guidance.** The server declares the `io.modelcontextprotocol/skills` extension and lists
  `skills/showcase-guide`. With no `tool-affinity` in its frontmatter, NimbleBrain binds the skill
  to all of this server's tools and gives it to the agent before the agent first calls one.
- **Pages.** A `ui://` resource with MIME type `text/html;profile=mcp-app` is a whole page. The
  host loads it into a sandboxed frame, so the page is one self-contained document and uses buttons
  rather than form submission.
- **Placements.** The `ui.placements` list in the connector entry decides where pages appear. All
  placements of one connector share one `ui://` authority, here `showcase`.

To start your own app, copy this folder, change `serverName` and the `ui://` authority, and replace
the board with your own data.

## Test

```bash
bun test
```

The tests run the MCP server in process, with no port: the board and tour, the skills listing,
`tools/list` and `tools/call`, the pages, and the request checks. This folder is its own package,
so the repository's `bun run verify` neither builds nor tests it.
