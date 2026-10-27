#!/usr/bin/env bash
# Undo the fast path: stop what it started and remove exactly what setup.sh recorded as added in
# <checkout>/.nimblebrain-worktree/onboarding.json, plus each agent's nimblebrain plugin and
# marketplace when they come from the recorded source. Anything the person had before is left alone,
# and an entry changed since setup is reported, not removed. The checkout folder itself stays; delete
# it yourself if you want it gone.
#
# Usage: uninstall.sh [<checkout>] [--delete-key]
#   --delete-key  also delete the keychain item set-key.sh saved (asks first)

set -euo pipefail

dir=${NB_DIR:-$HOME/nimblebrain} delete_key=0
for a in "$@"; do case "$a" in --delete-key) delete_key=1 ;; *) dir=$a ;; esac; done
dir=$(cd "$dir" && pwd -P)
here=$(dirname "$0")
state="$dir/.nimblebrain-worktree/onboarding.json"
[ -f "$state" ] || { echo "[uninstall] no $state; nothing recorded to remove" >&2; exit 1; }
get() { STATE=$state bun -e "const s = await Bun.file(process.env.STATE).json(); $1"; }
door=$(get 'console.log(`http://localhost:${s.ports.api}/mcp/${s.workspaceId}`)')
repo=$(get 'console.log(s.repo ?? "")')
added=$(get 'console.log((s.added ?? []).join("\n"))')
has() { printf '%s\n' "$added" | grep -qx "$1"; }
step() { printf '[uninstall] %s\n' "$*"; }

bash "$here/stop.sh" "$dir"

if has claude-mcp:nimblebrain && command -v claude >/dev/null; then
  u=$(claude mcp get nimblebrain 2>/dev/null | sed -n 's/^ *URL: //p' || true)
  if [ "$u" = "$door" ]; then claude mcp remove nimblebrain -s user >/dev/null && step "removed Claude Code MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Claude Code MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-mcp:nimblebrain && command -v codex >/dev/null; then
  u=$(codex mcp get nimblebrain --json 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")' || true)
  if [ "$u" = "$door" ]; then codex mcp remove nimblebrain >/dev/null && step "removed Codex MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Codex MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-feature:mcp_2026_07_28 && command -v codex >/dev/null; then
  codex features disable mcp_2026_07_28 >/dev/null 2>&1 && step "turned off Codex feature mcp_2026_07_28 (setup had turned it on)"
fi

for item in $(printf '%s\n' "$added" | sed -n 's/^desktop://p'); do
  web=$(get 'console.log(s.ports.web)')
  if [ -f "$item" ] && grep -q "<string>http://localhost:$web</string>" "$item"; then
    mv "$item" "$dir/.nimblebrain-worktree/" && step "moved the Desktop shortcut into $dir/.nimblebrain-worktree/"
  fi
done

# Plugins: only a marketplace named nimblebrain whose source is the recorded one.
key=${repo#https://github.com/}
key=${key%.git}
ours() { case "$1" in *'"name":"nimblebrain"'*) case "$1" in *"$key"*) return 0 ;; esac ;; esac; return 1; }
if command -v claude >/dev/null && ours "$(claude plugin marketplace list --json 2>/dev/null | tr -d ' \n' || true)"; then
  claude plugin marketplace remove nimblebrain >/dev/null && step "removed the Claude Code nimblebrain plugin and its marketplace"
fi
if command -v codex >/dev/null && ours "$(codex plugin marketplace list --json 2>/dev/null | tr -d ' \n' || true)"; then
  codex plugin remove nimblebrain@nimblebrain >/dev/null 2>&1 || true
  codex plugin marketplace remove nimblebrain >/dev/null && step "removed the Codex nimblebrain plugin and its marketplace"
fi

if [ "$delete_key" = 1 ] && [ "$(uname)" = Darwin ]; then
  printf 'Delete the Anthropic key saved for NimbleBrain from your keychain? [y/N] '
  read -r yes </dev/tty || yes=n
  case "$yes" in [yY]*)
    security delete-generic-password -s "${NB_KEYCHAIN_SERVICE:-nimblebrain}" -a ANTHROPIC_API_KEY \
      ${NB_KEYCHAIN:+"$NB_KEYCHAIN"} >/dev/null 2>&1 && step "deleted the keychain item" ;;
  esac
fi

# What was removed is no longer ours to remove: a later uninstall must not undo the person's own
# changes. The checkout, .env and connectors stay, so they stay on the list.
STATE=$state bun -e '
  const s = await Bun.file(process.env.STATE).json();
  s.added = (s.added ?? []).filter((a) => /^(checkout|env-file|env|config|connector):/.test(a));
  s.agents = {};
  await Bun.write(process.env.STATE, `${JSON.stringify(s, null, 2)}\n`);
'
step "done. The checkout stays at $dir, with its .env and state. Delete the folder yourself to remove it."
