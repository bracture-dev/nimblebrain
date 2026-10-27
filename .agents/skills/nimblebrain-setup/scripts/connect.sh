#!/usr/bin/env bash
# Add the showcase and GlassEngine to the local workspace as connectors, then restart NimbleBrain.
# Needs NimbleBrain started once (that creates the workspace) and both examples running (GlassEngine
# writes its token on first start). The examples keep running; only NimbleBrain restarts, because it
# reads connectors only at start. Backs up each file once before its first edit, adds only what is
# missing, and asks (exit 3) about a value set differently, so a second run changes nothing.
#
# Usage: connect.sh <checkout> [--showcase-port <port>] [--glass-port <port>]

set -euo pipefail

dir=$(cd "${1:?usage: connect.sh <checkout> [--showcase-port N] [--glass-port N]}" && pwd)
shift
sc=27280
ge=27281
while [ $# -gt 0 ]; do
  case "$1" in
    --showcase-port) sc="$2"; shift 2 ;;
    --glass-port) ge="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
here=$(dirname "$0")
work="$dir/.nimblebrain-worktree"

api=$([ -f "$dir/.env" ] && sed -n 's/^NB_API_PORT=\([0-9][0-9]*\).*/\1/p' "$dir/.env" | tail -1 || true)
api=${api:-27271}

ws=$(curl -fsS "http://127.0.0.1:$api/v1/bootstrap" 2>/dev/null | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  console.log((j.workspaces ?? [])[0]?.id ?? "");
') || ws=""
[ -n "$ws" ] || { echo "[connect] NimbleBrain is not answering on port $api; run start.sh first" >&2; exit 1; }

token_file="$dir/examples/glassengine/.glassengine/token"
[ -s "$token_file" ] || { echo "[connect] no $token_file; run examples.sh start first" >&2; exit 1; }

echo "[connect] workspace $ws"
# Adds only our keys. A value already set differently is reported (exit 3) and left alone. Each file
# gets one timestamped backup next to it before our first edit.
changed=$(CFG="$work/nimblebrain.json" WSJ="$work/workspaces/$ws/workspace.json" SC="$sc" GE="$ge" \
  GE_TOKEN="$(cat "$token_file")" bun -e '
  import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
  import { basename, dirname } from "node:path";
  const { CFG, WSJ, SC, GE, GE_TOKEN } = process.env;
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const write = (p, v) => {
    const mine = readdirSync(dirname(p)).some((f) => f.startsWith(`${basename(p)}.nimblebrain-setup-`));
    if (!mine) copyFileSync(p, `${p}.nimblebrain-setup-${stamp}.bak`);
    writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
  };
  const ask = (m) => { console.error(`ASK: ${m}`); process.exit(3); };
  const added = [];
  const cfg = read(CFG);
  if (cfg.allowInsecureRemotes === false) ask(`${CFG} sets allowInsecureRemotes to false; the local connectors need true. Change it yourself, or skip the connectors.`);
  if (cfg.allowInsecureRemotes !== true) { cfg.allowInsecureRemotes = true; write(CFG, cfg); added.push("config:allowInsecureRemotes"); }
  const ws = read(WSJ);
  const wanted = [
    {
      url: `http://127.0.0.1:${SC}/mcp`,
      serverName: "showcase",
      transport: { type: "streamable-http", auth: { type: "bearer", token: "local-showcase" } },
      ui: { placements: [
        { slot: "sidebar.apps", resourceUri: "ui://showcase/app", route: "showcase", label: "Showcase", priority: 20 },
        { slot: "main", resourceUri: "ui://showcase/tour", route: "showcase/tour", label: "Showcase tour" },
        { slot: "main", resourceUri: "ui://showcase/table", route: "showcase/table", label: "Showcase table" },
      ] },
    },
    {
      url: `http://127.0.0.1:${GE}/mcp`,
      serverName: "glassengine",
      transport: { type: "streamable-http", auth: { type: "bearer", token: GE_TOKEN } },
      ui: { placements: [
        { slot: "sidebar.apps", resourceUri: "ui://glassengine/main", route: "glassengine", label: "GlassEngine" },
      ] },
    },
  ];
  const connectors = ws.connectors ?? [];
  for (const entry of wanted) {
    const have = connectors.find((c) => c.serverName === entry.serverName);
    if (!have) { connectors.push(entry); added.push(`connector:${entry.serverName}`); continue; }
    if (have.url !== entry.url) ask(`workspace.json already has a ${entry.serverName} connector at ${have.url}, not ${entry.url}. Keep it, or remove it yourself and rerun.`);
    if (entry.serverName === "glassengine" && have.transport?.auth?.token !== GE_TOKEN)
      ask("workspace.json has a glassengine connector whose token differs from the token of this GlassEngine. Keep it, or remove it yourself and rerun.");
  }
  if (added.some((a) => a.startsWith("connector:"))) { ws.connectors = connectors; write(WSJ, ws); }
  for (const a of added) console.error(`[connect] added ${a}`);
  console.log(added.length);
') || exit $?

if [ "$changed" = 0 ]; then
  echo "[connect] already connected; nothing changed"
  exit 0
fi

echo "[connect] restarting NimbleBrain to load the connectors (the examples keep running)"
bash "$here/stop.sh" "$dir" --keep-examples
bash "$here/start.sh" "$dir"
for _ in $(seq 1 30); do
  grep -q 'showcase ready' "$work/dev.log" && grep -q 'glassengine ready' "$work/dev.log" && break
  sleep 1
done
grep -E '(showcase|glassengine) ready' "$work/dev.log" | sed 's/^/[connect] /' ||
  { echo "[connect] the connectors did not report ready; see $work/dev.log" >&2; exit 1; }
