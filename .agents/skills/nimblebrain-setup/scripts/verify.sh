#!/usr/bin/env bash
# Verify a running local NimbleBrain: API health, the web page, the workspace, and its MCP endpoint.
# Read-only apart from one nb__status tool call, which reads status and calls no model.
#
# Usage: verify.sh [api-port] [web-port]   (defaults 27271 27270)

set -uo pipefail

api=${1:-27271}
web=${2:-27270}
base="http://127.0.0.1:$api"
fail=0
ok() { printf 'ok    %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=1; }

health=$(curl -fsS "$base/v1/health" 2>/dev/null) || health=""
case "$health" in
  *'"ok"'*) ok "API health $base/v1/health" ;;
  *) bad "API health $base/v1/health (is it running? see dev.log)"; exit 1 ;;
esac

code=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:$web/" 2>/dev/null) || code=000
if [ "$code" = 200 ]; then ok "web page http://localhost:$web"; else bad "web page http://localhost:$web (HTTP $code)"; fi

# Dev mode needs no token for bootstrap. Take the first workspace.
read -r ws shown < <(curl -fsS "$base/v1/bootstrap" 2>/dev/null | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  const w = (j.workspaces ?? [])[0] ?? {};
  console.log(`${w.id ?? ""} ${w.mcpUrl ?? ""}`);
')
if [ -z "${ws:-}" ]; then bad "no workspace in /v1/bootstrap"; exit 1; fi
ok "workspace $ws"

url="http://localhost:$api/mcp/$ws"
here=$(dirname "$0")
names=$(bash "$here/nb-tool.sh" --api "$api" --list 2>/dev/null) || names=""
count=$(printf '%s\n' "$names" | grep -c . || true)
if [ "$count" -gt 0 ]; then
  ok "MCP tools/list: $count tools"
  # One line per connector prefix, so the showcase and GlassEngine show up once connected.
  printf '%s\n' "$names" | sed -n 's/^\([a-z0-9-]*\)__.*/\1/p' | sort | uniq -c |
    while read -r n prefix; do printf '        %s__: %s tools\n' "$prefix" "$n"; done
else
  bad "MCP tools/list returned no tools"
fi

status=$(bash "$here/nb-tool.sh" --api "$api" nb__status 2>/dev/null | tr '\n' '|' | sed 's/|/ | /g; s/ | $//') || status=""
if [ -n "$status" ]; then ok "MCP tools/call nb__status: $status"; else bad "MCP tools/call nb__status"; fi

if [ -n "${shown:-}" ] && [ "$shown" != "$url" ]; then
  printf 'note  the web page shows %s; set NB_PUBLIC_ORIGIN=http://localhost:%s in .env and restart\n' "$shown" "$api"
fi

echo
echo "Web page: http://localhost:$web"
echo "MCP URL:  $url"
exit "$fail"
