#!/usr/bin/env bash
# Stop a NimbleBrain started by start.sh: the launcher, the API and the web server.
#
# Usage: stop.sh <checkout>

set -euo pipefail

dir=$(cd "${1:?usage: stop.sh <checkout>}" && pwd)
pidfile="$dir/.nimblebrain-worktree/dev.pid"

if [ ! -f "$pidfile" ]; then
  echo "[stop] no $pidfile; if it runs in a terminal, press Ctrl+C there"
  exit 0
fi

pgid=$(cat "$pidfile")
if ! kill -0 "-$pgid" 2>/dev/null; then
  echo "[stop] not running"
  rm -f "$pidfile"
  exit 0
fi

kill -TERM "-$pgid"
for _ in $(seq 1 15); do
  kill -0 "-$pgid" 2>/dev/null || break
  sleep 1
done
if kill -0 "-$pgid" 2>/dev/null; then
  echo "[stop] still running after 15s; sending SIGKILL"
  kill -KILL "-$pgid" 2>/dev/null || true
fi
rm -f "$pidfile"
echo "[stop] stopped"
