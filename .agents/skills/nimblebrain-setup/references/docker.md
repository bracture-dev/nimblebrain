# Docker route

Use this when the person has Docker and does not want Bun or Node.js on the machine. It runs the
published images; there is no hot reload. The showcase and GlassEngine examples are written for
the source route: a container cannot reach servers listening on the host's `127.0.0.1`.

```bash
git clone https://github.com/NimbleBrainInc/nimblebrain.git "$NB_DIR"
cd "$NB_DIR"
echo '{"auth":{"adapter":"dev"}}' > instance.json
```

Create `.env` next to `docker-compose.yml` with an empty `ANTHROPIC_API_KEY=` line and ask the
person to paste their key, as in SKILL.md step 5. Compose reads `.env` for the key variables it
lists. Then:

```bash
docker compose up -d
```

- Web and API share one port: `http://localhost:27246` (web), `http://localhost:27246/v1/health`.
- MCP URL: `http://localhost:27246/mcp/<WS>`. Find `<WS>` with
  `curl -s http://localhost:27246/v1/bootstrap` (first entry of `workspaces`), or in the web page
  under workspace settings, MCP. `scripts/verify.sh 27246 27246` runs the same checks.
- State lives in the compose volume `workspace`, not in the folder.
- Stop: `docker compose down`. Uninstall: `docker compose down -v` (deletes the volume and every
  conversation and file in it; confirm first), then delete the folder.
- `instance.json` is gitignored; keep the dev adapter only on a machine you trust.
