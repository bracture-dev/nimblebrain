#!/usr/bin/env bash
# Start NimbleBrain from a checkout in the background, with its state inside the checkout.
# Reads NB_API_PORT and NB_WEB_PORT from <checkout>/.env (defaults 27271 and 27270).
# Log: <checkout>/.nimblebrain-worktree/dev.log. Stop with stop.sh.
# Reuses an instance this checkout already runs, and restarts one of ours that is not healthy. A
# port held by anything else exits 3 ("ASK:").
#
# Usage: start.sh <checkout>

set -euo pipefail

dir=$(cd "${1:?usage: start.sh <checkout>}" && pwd -P)
. "$(dirname "$0")/lib.sh"
state="$dir/.nimblebrain-worktree"
log="$state/dev.log"
pidfile="$state/dev.pid"

api=$(env_value "$dir" NB_API_PORT)
web=$(env_value "$dir" NB_WEB_PORT)
api=${api:-27271}
web=${web:-27270}

if owned "$pidfile" "$dir" "$api"; then
  if curl -fsS "http://127.0.0.1:$api/v1/health" >/dev/null 2>&1; then
    echo "[start] already running from this checkout: API http://localhost:$api, web http://localhost:$web"
    exit 0
  fi
  echo "[start] this checkout's NimbleBrain runs but is not healthy yet; restarting it"
  bash "$(dirname "$0")/stop.sh" "$dir" --keep-examples
fi

# The next free API/web pair above the chosen one. It never offers NimbleBrain's stock dev ports
# (27246, 27247) or the examples' (27280, 27281).
next_pair() {
  local w=$((web + 2))
  while [ "$w" -lt $((web + 40)) ]; do
    case " 27246 27247 27280 27281 " in *" $w "* | *" $((w + 1)) "*) ;; *)
      port_busy "$w" || port_busy $((w + 1)) || { echo "API $((w + 1)), web $w"; return; } ;;
    esac
    w=$((w + 2))
  done
}
for port in "$api" "$web"; do
  if port_busy "$port"; then
    echo "ASK: port $port is in use by something not started from this checkout (another NimbleBrain or another program). Leave it alone and set NB_API_PORT and NB_WEB_PORT in .env to a free pair, for example $(next_pair)." >&2
    exit 3
  fi
done

mkdir -p "$state"
# The key set-key.sh saved in the keychain goes only into the environment of this script and the
# NimbleBrain processes it starts (the launcher, the API and the web dev server). It is never
# printed or put on a command line. A value already in the environment wins, and NimbleBrain prefers
# the environment over .env.
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ "$(uname)" = Darwin ]; then
  if key=$(security find-generic-password -s "${NB_KEYCHAIN_SERVICE:-nimblebrain}" -a ANTHROPIC_API_KEY \
    -w ${NB_KEYCHAIN:+"$NB_KEYCHAIN"} 2>/dev/null) && [ -n "$key" ]; then
    export ANTHROPIC_API_KEY="$key"
    echo "[start] using the Anthropic key from the keychain"
  fi
  unset key
fi
# Own process group, so stop.sh can end the launcher, the API and the web server together.
# PORT is cleared because it would override the API port.
unset PORT
NB_API_PORT=$api NB_WEB_PORT=$web launch "$pidfile" "$log" "$dir" bun run dev:worktree
pgid=$(sed -n 1p "$pidfile")
echo "[start] started (process group $pgid), log: $log"

wait_for() {
  local url=$1 seconds=$2
  for _ in $(seq 1 "$seconds"); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    if ! kill -0 "-$pgid" 2>/dev/null; then
      echo "[start] the launcher exited; last log lines:" >&2
      tail -20 "$log" >&2
      exit 1
    fi
    sleep 1
  done
  echo "[start] no answer from $url after ${seconds}s; last log lines:" >&2
  tail -20 "$log" >&2
  exit 1
}
wait_for "http://127.0.0.1:$api/v1/health" 120
wait_for "http://localhost:$web/" 60

echo "[start] ready"
echo "[start]   web: http://localhost:$web"
echo "[start]   API: http://localhost:$api"
