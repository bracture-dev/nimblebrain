#!/usr/bin/env bash
# Read-only conflict report for the fast path. Changes nothing. Both agents and both entrypoints run
# it before the plan, and setup.sh runs it again before it changes anything.
# Each conflict is one entry: what we found, what we expected, and what setup will do:
#   reuse  use what is there as it is      skip  leave it alone and carry on
#   ask    setup stops until the person decides
#
# Usage: check.sh [--agent claude|codex] [--dir <folder>] [--repo <owner/repo|url|path>] [--ref <ref>]
#                 [--api <port>] [--web <port>] [--showcase-port <port>] [--glass-port <port>]
# Exit status: 0 nothing to ask, 3 at least one "ask" entry.

set -uo pipefail

. "$(dirname "$0")/lib.sh"
agent="" dir=${NB_DIR:-$HOME/nimblebrain} repo=NimbleBrainInc/nimblebrain ref=main
api="" web="" sc="" ge=""
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) agent=$2 ;; --dir) dir=$2 ;; --repo) repo=$2 ;; --ref) ref=$2 ;;
    --api) api=$2 ;; --web) web=$2 ;; --showcase-port) sc=$2 ;; --glass-port) ge=$2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift 2
done
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac

asks=0 found=0
report() { # found, expected, action
  found=1
  case "$3" in ask*) asks=1 ;; esac
  printf 'conflict  found: %s\n          expected: %s\n          will: %s\n' "$1" "$2" "$3"
}
have() { command -v "$1" >/dev/null 2>&1; }

case "$repo" in /* | ./* | ../* | "~"* | *://* | git@*) url=$repo ;; *) url="https://github.com/$repo.git" ;; esac
work="$dir/.nimblebrain-worktree"
api=${api:-$(state_port "$dir" api)} web=${web:-$(state_port "$dir" web)}
sc=${sc:-$(state_port "$dir" showcase)} ge=${ge:-$(state_port "$dir" glass)}
api=${api:-$(env_value "$dir" NB_API_PORT)} web=${web:-$(env_value "$dir" NB_WEB_PORT)}
api=${api:-27271} web=${web:-27270} sc=${sc:-27280} ge=${ge:-27281}

# The native plugins use these fixed example endpoints. Refuse before setup changes anything.
if [ "$sc" != 27280 ] || [ "$ge" != 27281 ]; then
  report "example ports $sc/$ge" "Showcase 27280 and GlassEngine 27281 for the native plugins" \
    "ask (use the default example ports, or configure the native MCP entries manually)"
  exit 3
fi

# Tools and versions. On macOS, git can be a stub that only offers to install the developer tools.
git --version >/dev/null 2>&1 || report "git is not installed" "git" "ask (offer the install command)"
for t in bun node curl; do have "$t" || report "$t is not installed" "$t on PATH" "ask (offer the install command)"; done
if have node; then
  nv=$(node --version | sed 's/^v//')
  [ "${nv%%.*}" -ge 22 ] 2>/dev/null || report "Node.js $nv" "Node.js 22 or newer" "ask (offer the install command)"
fi
if have bun && [ -f "$dir/package.json" ]; then
  pin=$(sed -n 's/.*"packageManager": *"bun@\([^"]*\)".*/\1/p' "$dir/package.json" | head -1)
  bv=$(bun --version)
  if [ -n "$pin" ] && [ "$bv" != "$pin" ]; then
    if [ "${bv%.*}" = "${pin%.*}" ]; then report "Bun $bv" "Bun $pin (package.json)" "reuse (same minor release)"
    else report "Bun $bv" "Bun $pin (package.json)" "ask (offer the pinned install)"; fi
  fi
fi

# The checkout.
if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
  if [ -e "$dir/.git" ]; then
    origin=$(git -C "$dir" remote get-url origin 2>/dev/null || echo "no origin")
    [ "$(norm_source "$origin")" = "$(norm_source "$url")" ] || report "$dir is a checkout of $origin" "$url" "ask"
    [ -z "$(git -C "$dir" status --porcelain --untracked-files=no 2>/dev/null)" ] ||
      report "$dir has uncommitted changes" "a clean checkout" "ask"
  else
    report "$dir exists and is not a git checkout" "an empty or missing folder" "ask"
  fi
fi
for other in "$HOME/nimblebrain" "${NB_DIR:-}"; do
  [ -n "$other" ] && [ -f "$other/.nimblebrain-worktree/onboarding.json" ] || continue
  [ "$(norm_source "$other")" = "$(norm_source "$dir")" ] && continue
  report "another NimbleBrain install at $other" "one install, at $dir" "skip (left alone; use --dir $other to reuse it)"
done
port_busy 27247 && report "a NimbleBrain on 27246/27247 (NimbleBrain's stock dev ports)" "nothing of ours there" "skip (never touched)"

# .env values that differ.
for pair in "NB_API_PORT=$api" "NB_WEB_PORT=$web" "NB_PUBLIC_ORIGIN=http://localhost:$api" "NB_TELEMETRY_DISABLED=1"; do
  v=$(env_value "$dir" "${pair%%=*}")
  [ -z "$v" ] || [ "$v" = "${pair#*=}" ] || report ".env has ${pair%%=*}=$v" "${pair#*=}" "ask (setup never changes an existing value)"
done

# Ports. Our own processes count only when lib.sh's owned confirms them.
if ! owned "$work/dev.pid" "$dir" "$api"; then
  for p in "$api" "$web"; do port_busy "$p" && report "port $p is in use, not by this checkout's NimbleBrain" "free, or this checkout's NimbleBrain" "ask (pick another free pair)"; done
fi
for pair in "showcase:$sc" "glassengine:$ge"; do
  name=${pair%%:*} p=${pair#*:}
  port_busy "$p" || continue
  owned "$work/examples/$name.pid" "$dir/examples/$name" "$p" && continue
  if [ "$name" = glassengine ] && curl -fsS "http://127.0.0.1:$p/health" 2>/dev/null | grep -q '"glassengine"'; then
    report "a GlassEngine from another folder on port $p" "free, or this checkout's GlassEngine" "ask (its token differs)"
  else
    report "port $p ($name) is in use by something else" "free, or this checkout's $name" "ask (native plugins require this port)"
  fi
done

# The Anthropic key: only whether it is set, never its value.
in_env=0 in_file=0 in_chain=0
[ -n "${ANTHROPIC_API_KEY:-}" ] && in_env=1
[ -f "$dir/.env" ] && grep -Eq '^ANTHROPIC_API_KEY=.+' "$dir/.env" && in_file=1
[ "$(uname)" = Darwin ] && security find-generic-password -s "${NB_KEYCHAIN_SERVICE:-nimblebrain}" -a ANTHROPIC_API_KEY \
  ${NB_KEYCHAIN:+"$NB_KEYCHAIN"} >/dev/null 2>&1 && in_chain=1
[ "$in_env" = 1 ] && [ $((in_file + in_chain)) -gt 0 ] &&
  report "ANTHROPIC_API_KEY set in this shell as well as saved" "one place for the key" "reuse (the shell value wins)"
[ "$in_env" = 0 ] && [ "$in_file" = 1 ] && [ "$in_chain" = 1 ] &&
  report "an Anthropic key in .env and in the keychain" "one place for the key" "reuse (the keychain value wins; .env is ignored)"

# The agents' own entries.
door=""
ws=$(curl -fsS "http://127.0.0.1:$api/v1/bootstrap" 2>/dev/null | (have bun && bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.workspaces?.[0]?.id ?? "")'))
[ -n "$ws" ] && door="http://localhost:$api/mcp/$ws"
want_url() { case $1 in nimblebrain) echo "$door" ;; showcase) echo "http://127.0.0.1:$sc/mcp" ;; glassengine) echo "http://127.0.0.1:$ge/mcp" ;; esac; }
src_of() { case "$repo" in /* | ./* | ../* | "~"*) norm_source "$repo" ;; *) echo "${repo%.git}" ;; esac; }
if { [ -z "$agent" ] || [ "$agent" = claude ]; } && have claude && have bun; then
  m=$(claude plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source claude "$(src_of)")
  case "$m" in other*) report "a Claude Code marketplace named nimblebrain from ${m#other }" "$repo" "ask (never replaced)" ;; esac
  for name in nimblebrain showcase glassengine; do
    u=$(claude mcp get "$name" </dev/null 2>/dev/null | sed -n 's/^ *URL: //p')
    [ -n "$u" ] || continue
    w=$(want_url "$name")
    if [ "$name" = nimblebrain ]; then
      [ -z "$w" ] || [ "$u" = "$w" ] || report "Claude Code MCP server nimblebrain at $u" "$w" "ask (never replaced)"
    else
      [ "$u" = "$w" ] || report "Claude Code MCP server $name at $u" "$w (the plugin carries its own entry)" "skip (left as it is)"
    fi
  done
fi
if { [ -z "$agent" ] || [ "$agent" = codex ]; } && have codex && have bun; then
  [ "$(codex_feature mcp_2026_07_28)" = false ] &&
    report "Codex feature mcp_2026_07_28 = false in ${CODEX_HOME:-$HOME/.codex}/config.toml" "on, so Codex reaches the workspace door" "ask (never flipped; nb-tool.sh still works)"
  m=$(codex plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source codex "$(src_of)")
  case "$m" in other*) report "a Codex marketplace named nimblebrain from ${m#other }" "$repo" "ask (never replaced)" ;; esac
  for name in nimblebrain showcase glassengine; do
    u=$(codex mcp get "$name" --json </dev/null 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")')
    [ -n "$u" ] || continue
    w=$(want_url "$name")
    if [ "$name" = nimblebrain ]; then
      [ -z "$w" ] || [ "$u" = "$w" ] || report "Codex MCP server nimblebrain at $u" "$w" "ask (never replaced)"
    else
      [ "$u" = "$w" ] || report "Codex MCP server $name at $u" "$w (the plugin carries its own entry)" "skip (left as it is)"
    fi
  done
fi

[ "$found" = 1 ] || echo "no conflicts"
[ "$asks" = 0 ] || exit 3
