#!/usr/bin/env bash
# Add the showcase and GlassEngine to the local workspace as connectors.
# Needs NimbleBrain started once (that creates the workspace) and both examples running (GlassEngine
# writes its token on first start). When something is missing it stops NimbleBrain (the examples
# keep running), edits nimblebrain.json and workspace.json, and starts NimbleBrain again, because it
# reads both only at start. It backs up each file once under .nimblebrain-worktree/backups/ before
# its first edit, adds only what is missing, and asks (exit 3) about a value set differently, so a
# second run changes nothing.
#
# Usage: connect.sh <checkout> [--showcase-port <port>] [--glass-port <port>]

set -euo pipefail

dir=$(cd "${1:?usage: connect.sh <checkout> [--showcase-port N] [--glass-port N]}" && pwd -P)
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
. "$here/lib.sh"
work="$dir/.nimblebrain-worktree"
api=$(env_value "$dir" NB_API_PORT)
api=${api:-27271}

ws=$(curl -fsS "http://127.0.0.1:$api/v1/bootstrap" 2>/dev/null | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  console.log((j.workspaces ?? [])[0]?.id ?? "");
') || ws=""
[ -n "$ws" ] || { echo "[connect] NimbleBrain is not answering on port $api; run start.sh first" >&2; exit 1; }

token_file="$dir/examples/glassengine/.glassengine/token"
[ -s "$token_file" ] || { echo "[connect] no $token_file; run examples.sh start first" >&2; exit 1; }
cfg="$work/nimblebrain.json"
wsj="$work/workspaces/$ws/workspace.json"
echo "[connect] workspace $ws"

# MODE=plan prints what is missing and changes nothing; MODE=apply writes it. A value already set
# differently is reported (exit 3) and left alone.
merge() {
  MODE=$1 CFG=$cfg WSJ=$wsj SC=$sc GE=$ge GE_TOKEN="$(cat "$token_file")" bun -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const { MODE, CFG, WSJ, SC, GE, GE_TOKEN } = process.env;
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const ask = (m) => { console.error(`ASK: ${m}`); process.exit(3); };
  const added = [];
  const cfg = read(CFG);
  if (cfg.allowInsecureRemotes === false) ask(`${CFG} sets allowInsecureRemotes to false; the local connectors need true. Change it yourself, or skip the connectors.`);
  if (cfg.allowInsecureRemotes !== true) { cfg.allowInsecureRemotes = true; added.push("config:allowInsecureRemotes"); }
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
  if (MODE === "apply") {
    if (added.includes("config:allowInsecureRemotes")) writeFileSync(CFG, `${JSON.stringify(cfg, null, 2)}\n`);
    if (added.some((a) => a.startsWith("connector:"))) { ws.connectors = connectors; writeFileSync(WSJ, `${JSON.stringify(ws, null, 2)}\n`); }
  }
  for (const a of added) console.log(a);
'
}

todo=$(merge plan) || exit $?
if [ -z "$todo" ]; then
  echo "[connect] already connected; nothing changed"
  exit 0
fi

echo "[connect] restarting NimbleBrain to load the connectors (the examples keep running)"
bash "$here/stop.sh" "$dir" --keep-examples
backup_once "$dir" "$cfg"
backup_once "$dir" "$wsj"
merge apply | sed 's/^/[connect] added /'
bash "$here/start.sh" "$dir"
for _ in $(seq 1 30); do
  grep -q 'showcase ready' "$work/dev.log" && grep -q 'glassengine ready' "$work/dev.log" && break
  sleep 1
done
for name in showcase glassengine; do
  grep -q "$name ready" "$work/dev.log" ||
    { echo "[connect] $name did not report ready; see $work/dev.log" >&2; exit 1; }
done
grep -E '(showcase|glassengine) ready' "$work/dev.log" | sed 's/^/[connect] /'
