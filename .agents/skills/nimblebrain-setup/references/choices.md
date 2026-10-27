# Choices

Ask once, in one message, with the defaults below. Record the answers; the summary repeats them.

## Folder

Any real folder the person owns, for example `~/nimblebrain` or `~/code/nimblebrain`. Not a
symlink and not a cloud-synced folder (sync tools fight with git and `node_modules`). Everything
lives inside it:

| Path | What |
|---|---|
| `<NB_DIR>/` | The NimbleBrain source, stock |
| `<NB_DIR>/.env` | Ports, telemetry switch and the provider key (gitignored) |
| `<NB_DIR>/.nimblebrain-worktree/` | All runtime state: config, workspaces, conversations, files, logs (gitignored) |

`bun run dev:worktree` is the launcher that keeps state there. Plain `bun run dev` keeps state in
`~/.nimblebrain` instead and uses ports 27247 and 27246.

## Route

- **From source** (default): needs Bun and Node.js, gives hot reload, and is the route the
  showcase and GlassEngine examples are written for.
- **Docker**: needs only Docker. See [docker.md](docker.md).

## Ports

Defaults 27271 (API) and 27270 (web), the `dev:worktree` defaults, so a second NimbleBrain on the
standard 27247 and 27246 can run alongside. Any free pair works. They go in `.env` as
`NB_API_PORT`, `NB_WEB_PORT` and `NB_PUBLIC_ORIGIN=http://localhost:<API>`. The last one makes the
MCP URL shown in the web page's workspace settings match the API port.

## Model provider and key

The key is the person's own and is billed to their provider account. It is read once, at start;
changing it means a restart. One key serves every workspace on the instance.

- **Anthropic** (default): put the key on `ANTHROPIC_API_KEY=` in `.env`. Nothing else to configure.
- **OpenAI, Google, xAI, GreenPT, Nebius**: put the key on its variable (`OPENAI_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY`, `GREENPT_API_KEY`, `NEBIUS_API_KEY`), then after the
  first start edit `<NB_DIR>/.nimblebrain-worktree/nimblebrain.json` (back it up first) to name the
  provider and the model slots, and restart:

  ```json
  {
    "providers": { "openai": {} },
    "models": { "default": "openai:<model-id>", "fast": "openai:<model-id>" }
  }
  ```

  Merge these keys into the existing file; keep its `$schema`, `version` and `workDir`.
- **No key yet**: fine. Install, start, verify and agent connection all work; chat inside
  NimbleBrain does not until a key is set.

How the key gets into `.env`: the person opens the file in their editor and pastes it. Do not
offer to paste it for them, do not echo it into the file from a command, and do not read the file
back. If they keep keys in a secret manager, they may export the variable in the shell that runs
`bun run dev:worktree` instead; a shell value wins over `.env`.

## Telemetry

Default off: `NB_TELEMETRY_DISABLED=1` in `.env`. A source build sends no usage data unless a
`POSTHOG_API_KEY` is set, but without the switch the first start writes an anonymous id to
`~/.nimblebrain/.telemetry-id` and prints a telemetry notice. `DO_NOT_TRACK=1` works too. Remove
the line to leave the default.

## What to connect

- The agent running this skill (Claude Code or Codex), to the workspace MCP endpoint. See
  [connect-agents.md](connect-agents.md).
- Another agent the person uses, now or later through GlassEngine.
- Connectors from the web page's Connectors catalog (some need their own sign-in or key).
- Hosted chat apps (claude.ai, ChatGPT, desktop chat apps' custom connectors) run their connectors
  from the vendor's servers and cannot reach a NimbleBrain on this machine. Use a local client.
