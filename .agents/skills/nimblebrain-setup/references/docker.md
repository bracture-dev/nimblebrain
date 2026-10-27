# Docker route

Use this route when the person has Docker and does not want Bun or Node.js on the machine. It runs
the published images, with no hot reload. The showcase and GlassEngine examples need the source
route: a container cannot reach servers on the host's `127.0.0.1`.

```bash
git clone https://github.com/NimbleBrainInc/nimblebrain.git "$NB_DIR"
cd "$NB_DIR"
echo '{"auth":{"adapter":"dev"}}' > instance.json
```

Create `.env` next to `docker-compose.yml` with an empty `ANTHROPIC_API_KEY=` line. Ask the person
to paste their key, as in SKILL.md step 5. Compose reads the key variables it lists from `.env`.
Then:

```bash
docker compose up -d
```

- Web and API share one port: `http://localhost:27246` (web), `http://localhost:27246/v1/health`.
- MCP URL: `http://localhost:27246/mcp/<WS>`. Find `<WS>` with
  `curl -s http://localhost:27246/v1/bootstrap` (first entry of `workspaces`), or in the web page
  under workspace settings, MCP. `scripts/verify.sh 27246 27246` runs the same checks.
- State lives in the compose volume `workspace`, not in the folder.
- Stop: `docker compose down`.
- Uninstall: `docker compose down -v`, then delete the folder. This deletes the volume and every
  conversation and file in it, so confirm first.
- `instance.json` is gitignored. Its `dev` adapter means no login: one local developer. For a real
  identity provider, see the docs page on `instance.json`.
- Telemetry stays on in this route, because the compose file does not pass `NB_TELEMETRY_DISABLED`
  to the container. To turn it off, add `NB_TELEMETRY_DISABLED=1` to the `environment` of
  `platform` in `docker-compose.yml`. That changes a tracked file.
