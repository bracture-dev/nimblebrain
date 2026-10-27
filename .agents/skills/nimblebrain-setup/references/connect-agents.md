# Connect a coding agent to the workspace

Every workspace is an MCP server at `http://localhost:<API>/mcp/<WS>`. An agent connected there
gets the same tools NimbleBrain's own agent has in that workspace: conversations, files, tasks,
skills, status, and every connector installed in it. For example, the agent can answer "list my
NimbleBrain conversations" by calling those tools.

Dev mode has no login. The `dev` adapter signs every request in as one local developer. For a real
identity provider, see the docs page on `instance.json`.

`scripts/verify.sh` prints the URL. To find the id by hand, run
`curl -s http://localhost:<API>/v1/bootstrap` and take `workspaces[0].id`. Or open the web page and
go to workspace settings, MCP.

The endpoint speaks only MCP revision `2026-07-28`. It refuses a client on an older revision with
JSON-RPC error `-32022` (unsupported protocol version).

## Claude Code

```bash
claude mcp add --transport http --scope user nimblebrain http://localhost:<API>/mcp/<WS>
# Not needed with the Claude Code plugin, which carries these two:
claude mcp add --transport http --scope user glassengine http://127.0.0.1:27281/mcp
claude mcp add --transport http --scope user showcase http://127.0.0.1:27280/mcp \
  --header "Authorization: Bearer local-showcase"
claude mcp get nimblebrain        # expect: Status: Connected
```

- `--scope user` makes the entry work in every folder and in the desktop app's Code tab. The
  default scope, `local`, applies only to the folder you run it in.
- `--scope project` writes `.mcp.json` into the current folder and asks for approval on the next
  start. Avoid it inside the NimbleBrain checkout, which should stay stock.
- A running session does not pick up a server added with `claude mcp add`. Until the next session,
  the agent reaches the same tools with `scripts/nb-tool.sh` (for example
  `nb-tool.sh nb__set_preferences '{"theme":"dark"}'`). A new session has them as MCP tools.
- To remove it: `claude mcp remove nimblebrain` (add `--scope user` if you added it there).

## Codex CLI

Which connection works on which MCP version (checked with an `initialize` request):

| Endpoint | Codex default | Needs `mcp_2026_07_28` |
|---|---|---|
| GlassEngine, `http://127.0.0.1:27281/mcp` | yes | no |
| Showcase, `http://127.0.0.1:27280/mcp` (bearer `local-showcase`) | yes | no |
| Workspace, `http://localhost:<API>/mcp/<WS>` | no, refused with `-32022` | yes |

The Codex plugin (`codex plugin add nimblebrain@nimblebrain`) brings the first two. Without the
plugin, add them to `~/.codex/config.toml`:

```toml
[mcp_servers.glassengine]
url = "http://127.0.0.1:27281/mcp"

[mcp_servers.showcase]
url = "http://127.0.0.1:27280/mcp"
http_headers = { Authorization = "Bearer local-showcase" }
```

The workspace needs the `mcp_2026_07_28` feature, which Codex marks as under development. The fast
path turns it on, as part of the plan the person approves, because it changes Codex's settings for
every project on the machine. `setup.sh` leaves it alone when the person set it to `false`.

```bash
codex features enable mcp_2026_07_28
codex mcp add nimblebrain --url http://localhost:<API>/mcp/<WS>
codex mcp list                    # nimblebrain: enabled
```

- `codex features enable` writes `mcp_2026_07_28 = true` under `[features]` in
  `~/.codex/config.toml`. `codex features disable mcp_2026_07_28` removes that line again. While it
  is on, Codex prints a warning about under-development features at start.
- `codex mcp list` shows `Auth: Unknown` for this server. That is expected: dev mode has no login.
- A project's `.codex/config.toml` that sets `enabled = false` for a server wins over the global
  entry. Check there if tools do not appear.
- With the feature on, Codex reaches NimbleBrain's own tools, so it saves the name, timezone and
  theme with `nb__set_preferences`. A new Codex session has them as MCP tools; until then, and in a
  session that started before the server was added, use `scripts/nb-tool.sh`.
- Fallback only: with the feature off, Codex still drives the showcase and joins GlassEngine, and
  `scripts/nb-tool.sh` still reaches NimbleBrain's tools, because it speaks `2026-07-28` itself.
- To remove it: `codex mcp remove nimblebrain`, and `codex features disable mcp_2026_07_28` if nothing
  else needs it.

## Any other MCP client

Point it at the URL with the Streamable HTTP transport. It must speak `2026-07-28`. A stock
`@modelcontextprotocol/client` 2.0.0 gets `-32022` unless you pin it to protocol `2026-07-28`. Here is the raw
request, for scripts and for checking a client by hand:

```bash
curl -s -X POST http://localhost:<API>/mcp/<WS> \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientInfo":{"name":"my-agent","version":"1.0"},
        "io.modelcontextprotocol/clientCapabilities":{}}}}'
```

`tools/call` takes the same envelope with `"method":"tools/call"`, `-H 'Mcp-Method: tools/call'`,
`-H 'Mcp-Name: <tool>'` and `"name"`, `"arguments"` next to `_meta` in `params`. There is no
`initialize` and no session id. Each request stands alone.

Some agents cannot speak MCP but have an API, a CLI or an SDK. They connect the other way round:
GlassEngine (`examples/glassengine/`) wraps the agent as a NimbleBrain connector.

## Hosted chat apps

claude.ai, ChatGPT and desktop chat apps run custom connectors from the vendor's servers. Those
servers cannot reach `localhost` on this machine, so use a local client.
