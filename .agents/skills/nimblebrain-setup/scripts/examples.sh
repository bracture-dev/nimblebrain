#!/usr/bin/env bash
# Install, start, stop or check the two bundled example apps (showcase and GlassEngine).
# An example with its own bun.lock gets a frozen install with scripts off; one without (GlassEngine)
# uses the checkout's root node_modules and starts without an install.
# Both listen on 127.0.0.1. Logs and pids: <checkout>/.nimblebrain-worktree/examples/.
# GlassEngine keeps its transcript and token in <checkout>/examples/glassengine/.glassengine/.
# An example this checkout already runs is reused. A port held by anything else exits 3 ("ASK:").
#
# Usage: examples.sh start|stop|status <checkout> [--showcase-port <port>] [--glass-port <port>]
#   defaults: showcase 27280, GlassEngine 27281

set -euo pipefail

cmd=${1:?usage: examples.sh start|stop|status <checkout> [--showcase-port N] [--glass-port N]}
dir=$(cd "${2:?usage: examples.sh start|stop|status <checkout>}" && pwd -P)
shift 2
. "$(dirname "$0")/lib.sh"
sc=27280
ge=27281
while [ $# -gt 0 ]; do
  case "$1" in
    --showcase-port) sc="$2"; shift 2 ;;
    --glass-port) ge="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

state="$dir/.nimblebrain-worktree/examples"
mkdir -p "$state"

start_one() {
  local name=$1 port=$2 token=$3
  local src="$dir/examples/$name" pidfile="$state/$name.pid" log="$state/$name.log"
  if [ ! -d "$src" ]; then
    echo "[examples] $name: $src does not exist in this version of NimbleBrain; skipping" >&2
    return 0
  fi
  if port_busy "$port"; then
    if owned "$pidfile" "$src" "$port"; then
      echo "[examples] $name: already running on 127.0.0.1:$port"
      return 0
    fi
    if [ "$name" = glassengine ] && curl -fsS "http://127.0.0.1:$port/health" 2>/dev/null | grep -q '"glassengine"'; then
      echo "ASK: a GlassEngine started from another folder answers on 127.0.0.1:$port. Its token differs from this checkout's. Stop it, or pass --glass-port with a free port." >&2
    else
      echo "ASK: port $port ($name) is in use by something else. Pass another port." >&2
    fi
    return 3
  fi
  if [ -f "$src/bun.lock" ]; then
    (cd "$src" && bun install --frozen-lockfile --ignore-scripts >"$state/$name.install.log" 2>&1)
  elif [ ! -d "$dir/node_modules" ]; then
    # No lockfile of its own: it resolves imports from the checkout's root node_modules.
    echo "[examples] $name: has no lockfile of its own and the checkout's root dependencies are not installed; run install.sh first" >&2
    return 1
  fi
  if [ -n "$token" ]; then
    PORT=$port SHOWCASE_TOKEN=$token launch "$pidfile" "$log" "$src" bun run start
  else
    PORT=$port launch "$pidfile" "$log" "$src" bun run start
  fi
  for _ in $(seq 1 30); do
    if port_busy "$port"; then
      echo "[examples] $name: listening on http://127.0.0.1:$port/mcp, log: $log"
      return 0
    fi
    kill -0 "-$(sed -n 1p "$pidfile")" 2>/dev/null || break
    sleep 1
  done
  echo "[examples] $name: did not start; last log lines:" >&2
  tail -15 "$log" >&2
  return 1
}

case "$cmd" in
  start)
    start_one showcase "$sc" local-showcase
    start_one glassengine "$ge" ""
    ;;
  stop)
    stop_group "$state/showcase.pid" "$dir/examples/showcase" "[examples] showcase:" "$sc"
    stop_group "$state/glassengine.pid" "$dir/examples/glassengine" "[examples] glassengine:" "$ge"
    ;;
  status)
    for pair in "showcase $sc" "glassengine $ge"; do
      set -- $pair
      if port_busy "$2"; then echo "[examples] $1: listening on 127.0.0.1:$2"; else echo "[examples] $1: not listening on $2"; fi
    done
    ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
