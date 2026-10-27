#!/usr/bin/env bash
# Call a tool on the local workspace's MCP door, http://localhost:<api>/mcp/<wsId>, over plain HTTP.
# An agent uses this when the door is not yet loaded as an MCP server in its session (a running
# session does not pick up a server added after it started). It speaks MCP 2026-07-28 itself, so it
# works from any agent, with or without Codex's mcp_2026_07_28 feature.
#
# Usage: nb-tool.sh [--dir <checkout> | --api <port>] --list                 tool names, one per line
#        nb-tool.sh [--dir <checkout> | --api <port>] <tool> ['<json args>']  e.g.
#          nb-tool.sh --dir ~/nimblebrain nb__set_preferences '{"theme":"dark"}'
# The API port comes from --api, else the install's onboarding.json, else its .env (--dir defaults
# to $NB_DIR or ~/nimblebrain). It refuses to guess when none of them names a port.
# Prints the tool's text result. Exit status 1 when the call fails or the tool reports an error.

set -euo pipefail

. "$(dirname "$0")/lib.sh"
api="" dir=${NB_DIR:-$HOME/nimblebrain}
while [ $# -gt 0 ]; do
  case "$1" in
    --api) api=$2; shift 2 ;;
    --dir) dir=$2; shift 2 ;;
    *) break ;;
  esac
done
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
[ -n "$api" ] || api=$(state_port "$dir" api)
[ -n "$api" ] || api=$(env_value "$dir" NB_API_PORT)
[ -n "$api" ] || { echo "no API port: pass --api <port>, or --dir <checkout> of a NimbleBrain set up by setup.sh" >&2; exit 2; }
tool=${1:?usage: nb-tool.sh [--dir <checkout> | --api <port>] --list | <tool> ['<json args>']}
args=${2:-'{}'}
base="http://127.0.0.1:$api"

ws=$(curl -fsS "$base/v1/bootstrap" | bun -e '
  const j = await Bun.stdin.json().catch(() => ({}));
  console.log((j.workspaces ?? [])[0]?.id ?? "");
') || { echo "no answer from $base/v1/bootstrap; is NimbleBrain running?" >&2; exit 1; }
[ -n "$ws" ] || { echo "no workspace in $base/v1/bootstrap" >&2; exit 1; }

meta='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"nimblebrain-setup","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}'
if [ "$tool" = --list ]; then
  method=tools/list name="" params=$meta
else
  method=tools/call name=$tool params="\"name\":\"$tool\",\"arguments\":$args,$meta"
fi

curl -fsS -X POST "$base/mcp/$ws" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H "Mcp-Method: $method" \
  ${name:+-H "Mcp-Name: $name"} \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":{$params}}" |
  bun -e '
    const j = await Bun.stdin.json().catch(() => ({}));
    if (j.error) { console.error(`error ${j.error.code}: ${j.error.message}`); process.exit(1); }
    const r = j.result ?? {};
    if (r.tools) { for (const t of r.tools) console.log(t.name); process.exit(0); }
    for (const c of r.content ?? []) if (c.type === "text") console.log(c.text);
    process.exit(r.isError ? 1 : 0);
  '
