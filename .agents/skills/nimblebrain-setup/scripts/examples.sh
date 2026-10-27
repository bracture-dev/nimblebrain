#!/usr/bin/env bash
# Install, start, stop or check the two bundled example apps (showcase and GlassEngine).
# Both listen on 127.0.0.1 only. State and logs: <checkout>/.nimblebrain-worktree/examples/.
#
# Usage: examples.sh start|stop|status <checkout> [--showcase-port <port>] [--glass-port <port>]
#   defaults: showcase 27280, GlassEngine 27281

set -euo pipefail

cmd=${1:?usage: examples.sh start|stop|status <checkout> [--showcase-port N] [--glass-port N]}
dir=$(cd "${2:?usage: examples.sh start|stop|status <checkout>}" && pwd)
shift 2
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

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

stop_one() {
  local name=$1 pidfile="$state/$1.pid"
  [ -f "$pidfile" ] || { echo "[examples] $name: not started by this script"; return 0; }
  local pgid
  pgid=$(cat "$pidfile")
  if kill -0 "-$pgid" 2>/dev/null; then
    kill -TERM "-$pgid"
    for _ in $(seq 1 10); do
      kill -0 "-$pgid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "-$pgid" 2>/dev/null; then kill -KILL "-$pgid" 2>/dev/null || true; fi
    echo "[examples] $name: stopped"
  else
    echo "[examples] $name: not running"
  fi
  : >"$pidfile"
}

start_one() {
  local name=$1 port=$2 token=$3
  local src="$dir/examples/$name" pidfile="$state/$name.pid" log="$state/$name.log"
  if [ ! -d "$src" ]; then
    echo "[examples] $name: $src does not exist in this version of NimbleBrain; skipping" >&2
    return 0
  fi
  if port_busy "$port"; then
    if [ -s "$pidfile" ] && kill -0 "-$(cat "$pidfile")" 2>/dev/null; then
      echo "[examples] $name: already running on 127.0.0.1:$port"
      return 0
    fi
    echo "[examples] $name: port $port is in use by something else; pass another port" >&2
    return 1
  fi
  if [ ! -f "$src/bun.lock" ]; then
    echo "[examples] $name: no bun.lock, so a frozen install is not possible; ask the person before a plain install" >&2
    return 1
  fi
  (cd "$src" && bun install --frozen-lockfile --ignore-scripts >"$state/$name.install.log" 2>&1)
  set -m
  if [ -n "$token" ]; then
    (cd "$src" && env -u PORT PORT="$port" SHOWCASE_TOKEN="$token" nohup bun run start >"$log" 2>&1) &
  else
    (cd "$src" && env -u PORT PORT="$port" nohup bun run start >"$log" 2>&1) &
  fi
  echo $! >"$pidfile"
  set +m
  for _ in $(seq 1 30); do
    if port_busy "$port"; then
      echo "[examples] $name: listening on http://127.0.0.1:$port/mcp, log: $log"
      return 0
    fi
    kill -0 "$(cat "$pidfile")" 2>/dev/null || break
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
    stop_one showcase
    stop_one glassengine
    ;;
  status)
    for pair in "showcase $sc" "glassengine $ge"; do
      set -- $pair
      if port_busy "$2"; then echo "[examples] $1: listening on 127.0.0.1:$2"; else echo "[examples] $1: not listening on $2"; fi
    done
    ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
