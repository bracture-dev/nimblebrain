# Connect a coding agent to the workspace

Every workspace is an MCP server at `http://localhost:<API>/mcp/<WS>`. A client connected there
gets the same tools NimbleBrain's own agent has in that workspace: conversations, files, tasks,
skills, status, and every connector installed in it. The `dev` adapter signs every request in as
one local developer, so there is no sign-in step; for a real identity provider, see the docs page
on `instance.json`.

`scripts/verify.sh` prints the URL. By hand: `curl -s http://localhost:<API>/v1/bootstrap` and take
`workspaces[0].id`, or open the web page and go to workspace settings, MCP.

The endpoint speaks MCP revision `2026-07-28` only. A client on an older revision is refused with
JSON-RPC error `-32022` (unsupported protocol version).

## Claude Code

```bash
claude mcp add --transport http --scope user glassengine http://127.0.0.1:27281/mcp
claude mcp add --transport http --scope user nimblebrain http://localhost:<API>/mcp/<WS>
claude mcp get nimblebrain        # expect: Status: Connected
```

- `--scope user` puts the entry in every folder and in the desktop app's Code tab. The default
  scope, `local`, applies only to the folder you run it in. `--scope project` writes `.mcp.json` into the current folder and asks for approval
  on next start; avoid it inside the NimbleBrain checkout, which should stay stock.
- The running session does not pick up a new server. Start a new `claude` session, then try
  "list my NimbleBrain conversations" or "what is NimbleBrain's status?".
- Remove: `claude mcp remove nimblebrain` (add `--scope user` if added there).

## Codex CLI (experimental)

Codex's support for revision `2026-07-28` sits behind the `mcp_2026_07_28` feature flag, which is
marked under development. Without it the connection is refused.

```bash
codex mcp add nimblebrain --url http://localhost:<API>/mcp/<WS>
codex features enable mcp_2026_07_28
codex mcp list                    # nimblebrain: enabled
```

- This writes `~/.codex/config.toml`: a `[mcp_servers.nimblebrain]` entry with the `url`, and
  `mcp_2026_07_28 = true` under `[features]`. On a Codex without `codex features`, add those two
  lines to the file by hand. Codex prints a warning about under-development features at start.
- `codex mcp list` shows `Auth: Unsupported` for this server; that is expected, dev mode needs none.
- A project's `.codex/config.toml` that sets `enabled = false` for the server wins over the global
  entry; check there if tools do not appear.
- Start a new Codex session and ask it to call `nb__status` from the nimblebrain server.
- Remove: `codex mcp remove nimblebrain`, and `codex features disable mcp_2026_07_28` if nothing
  else needs it.

## Any other MCP client

Point it at the URL with the Streamable HTTP transport. It must speak `2026-07-28`. Raw shape, for
scripts and for checking a client by hand:

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
`initialize` and no session id; each request stands alone.

An agent that cannot speak MCP itself, but has an API, a CLI or an SDK, connects the other way
round: GlassEngine (`examples/glassengine/`) wraps it as a NimbleBrain connector.

## Hosted chat apps

claude.ai, ChatGPT and desktop chat apps add custom connectors from the vendor's servers, which
cannot reach `localhost` on this machine. Use a local client. Linux, Windows and other agents are
next steps, not tested.
