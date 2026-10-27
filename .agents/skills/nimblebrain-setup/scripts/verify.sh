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
meta='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"nimblebrain-setup","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}'
mcp() {
  local method=$1 name=$2 params=$3
  curl -fsS -X POST "$base/mcp/$ws" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H 'MCP-Protocol-Version: 2026-07-28' \
    -H "Mcp-Method: $method" \
    ${name:+-H "Mcp-Name: $name"} \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":{$params$meta}}" 2>/dev/null
}

count=$(mcp tools/list "" "" | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  console.log(j.result?.tools?.length ?? 0);
')
if [ "${count:-0}" -gt 0 ]; then ok "MCP tools/list: $count tools"; else bad "MCP tools/list returned no tools"; fi

status=$(mcp tools/call nb__status '"name":"nb__status","arguments":{},' | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  const t = j.result?.content?.[0]?.text;
  console.log(j.result && !j.result.isError && t ? t.replace(/\n/g, " | ") : "");
')
if [ -n "$status" ]; then ok "MCP tools/call nb__status: $status"; else bad "MCP tools/call nb__status"; fi

if [ -n "${shown:-}" ] && [ "$shown" != "$url" ]; then
  printf 'note  the web page shows %s; set NB_PUBLIC_ORIGIN=http://localhost:%s in .env and restart\n' "$shown" "$api"
fi

echo
echo "Web page: http://localhost:$web"
echo "MCP URL:  $url"
exit "$fail"
