#!/usr/bin/env bash
# Check what a local NimbleBrain needs. Read-only: installs nothing, changes nothing.
#
# Usage: doctor.sh [--dir <checkout>] [--api <port>] [--web <port>]
#   --dir  an existing checkout, to compare Bun with its packageManager pin
#   --api  API port to check (default 27271)
#   --web  web port to check (default 27270)
# Exit status: 0 when every required item is present, 1 otherwise.

set -u

dir=""
api=27271
web=27270
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="$2"; shift 2 ;;
    --api) api="$2"; shift 2 ;;
    --web) web="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

missing=0
ok() { printf 'ok       %s\n' "$*"; }
warn() { printf 'warn     %s\n' "$*"; }
miss() { printf 'missing  %s\n' "$*"; missing=1; }

if command -v git >/dev/null 2>&1; then ok "git $(git --version | awk '{print $3}')"; else miss "git"; fi

pin=""
if [ -n "$dir" ] && [ -f "$dir/package.json" ]; then
  pin=$(sed -n 's/.*"packageManager": *"bun@\([^"]*\)".*/\1/p' "$dir/package.json" | head -1)
fi
if command -v bun >/dev/null 2>&1; then
  have=$(bun --version)
  if [ -z "$pin" ]; then
    ok "bun $have (compare with packageManager in package.json after cloning)"
  elif [ "$have" = "$pin" ]; then
    ok "bun $have (matches the pin)"
  elif [ "${have%.*}" = "${pin%.*}" ]; then
    warn "bun $have, package.json pins $pin (same minor; usually fine)"
  else
    miss "bun $pin (found $have)"
  fi
else
  miss "bun${pin:+ $pin}"
fi

if command -v node >/dev/null 2>&1; then
  nv=$(node --version | sed 's/^v//')
  if [ "${nv%%.*}" -ge 22 ] 2>/dev/null; then ok "node $nv"; else miss "node 22+ (found $nv)"; fi
else
  miss "node 22+ (the web dev server runs on it)"
fi

if command -v curl >/dev/null 2>&1; then ok "curl"; else miss "curl"; fi

# A port is busy when anything accepts a connection on it, over IPv4 or IPv6 loopback.
port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && return 0
  return 1
}

running=0
curl -fsS "http://127.0.0.1:$api/v1/health" >/dev/null 2>&1 && running=1
for pair in "api:$api" "web:$web"; do
  name=${pair%%:*}
  port=${pair#*:}
  if ! port_busy "$port"; then
    ok "port $port free ($name)"
  elif [ "$running" = 1 ]; then
    warn "port $port ($name): a NimbleBrain already runs on these ports; reuse it or stop it first"
  else
    miss "port $port free ($name): something else is listening; pick another port"
  fi
done

if [ -n "${PORT:-}" ]; then
  warn "PORT=$PORT is set in this shell; it overrides the API port. Unset it before starting."
fi

exit "$missing"
