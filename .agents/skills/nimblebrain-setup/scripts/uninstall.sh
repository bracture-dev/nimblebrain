#!/usr/bin/env bash
# Undo the fast path: stop what it started and remove exactly what was recorded as added in
# <checkout>/.nimblebrain-worktree/onboarding.json, by setup.sh and by install.sh. Anything the
# person had before is left alone, and an entry changed since setup is reported, not removed. The
# checkout folder itself stays; delete it yourself if you want it gone.
#
# Usage: uninstall.sh [<checkout>] [--delete-key]
#   --delete-key  also delete the keychain item set-key.sh saved (asks first)

set -euo pipefail

dir=${NB_DIR:-$HOME/nimblebrain} delete_key=0
for a in "$@"; do case "$a" in --delete-key) delete_key=1 ;; *) dir=$a ;; esac; done
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
dir=$(cd "$dir" && pwd -P)
here=$(cd "$(dirname "$0")" && pwd -P)
. "$here/lib.sh"
state="$dir/.nimblebrain-worktree/onboarding.json"
[ -f "$state" ] || { echo "[uninstall] no $state; nothing recorded to remove" >&2; exit 1; }
get() { STATE=$state bun -e "const s = await Bun.file(process.env.STATE).json(); $1"; }
door=$(get 'console.log(`http://localhost:${s.ports.api}/mcp/${s.workspaceId}`)')
web=$(get 'console.log(s.ports.web)')
repo=$(get 'console.log(s.repo ?? "")')
added=$(get 'console.log((s.added ?? []).join("\n"))')
has() { printf '%s\n' "$added" | grep -qx "$1"; }
step() { printf '[uninstall] %s\n' "$*"; }
# The recorded source, in the form the agents list it.
want=$repo
[ -d "$repo" ] && want=$(cd "$repo" && pwd -P)

bash "$here/stop.sh" "$dir"

if has claude-mcp:nimblebrain && command -v claude >/dev/null; then
  u=$(claude mcp get nimblebrain </dev/null 2>/dev/null | sed -n 's/^ *URL: //p' || true)
  if [ "$u" = "$door" ]; then claude mcp remove nimblebrain -s user </dev/null >/dev/null && step "removed Claude Code MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Claude Code MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-mcp:nimblebrain && command -v codex >/dev/null; then
  u=$(codex mcp get nimblebrain --json </dev/null 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")' || true)
  if [ "$u" = "$door" ]; then codex mcp remove nimblebrain </dev/null >/dev/null && step "removed Codex MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Codex MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-feature:mcp_2026_07_28 && command -v codex >/dev/null && [ "$(codex_feature mcp_2026_07_28)" = true ]; then
  codex features disable mcp_2026_07_28 </dev/null >/dev/null && step "turned off Codex feature mcp_2026_07_28 (setup had turned it on)"
fi

# The Desktop shortcut, only while it still holds our address. It moves into the checkout, under a
# timestamped name, so an earlier one is never overwritten.
printf '%s\n' "$added" | sed -n 's/^desktop://p' | while IFS= read -r item; do
  if [ -f "$item" ] && grep -q "<string>http://localhost:$web</string>" "$item"; then
    dest="$dir/.nimblebrain-worktree/NimbleBrain-$(date +%Y%m%d%H%M%S).webloc"
    mv "$item" "$dest" && step "moved the Desktop shortcut to $dest"
  fi
done

# Plugins and marketplaces: only those recorded as added, and only while the marketplace named
# nimblebrain still comes from the recorded source.
if command -v claude >/dev/null && { has claude-plugin || has claude-marketplace; }; then
  m=$(claude plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source claude "$want")
  if [ "$m" = same ]; then
    if has claude-marketplace; then
      claude plugin marketplace remove nimblebrain </dev/null >/dev/null && step "removed the Claude Code nimblebrain marketplace and its plugin"
    else
      claude plugin uninstall nimblebrain@nimblebrain </dev/null >/dev/null && step "removed the Claude Code nimblebrain plugin"
    fi
  elif [ "$m" != absent ]; then
    step "left the Claude Code nimblebrain marketplace: it now comes from ${m#other }"
  fi
fi
if command -v codex >/dev/null && { has codex-plugin || has codex-marketplace; }; then
  m=$(codex plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source codex "$want")
  if [ "$m" = same ]; then
    codex plugin remove nimblebrain@nimblebrain </dev/null >/dev/null 2>&1 && step "removed the Codex nimblebrain plugin"
    has codex-marketplace && codex plugin marketplace remove nimblebrain </dev/null >/dev/null &&
      step "removed the Codex nimblebrain marketplace"
  elif [ "$m" != absent ]; then
    step "left the Codex nimblebrain marketplace: it now comes from ${m#other }"
  fi
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
# changes. The checkout, .env and connectors stay, so they stay on the list. install.sh's note goes
# too, now that its entries are handled.
STATE=$state bun -e '
  const s = await Bun.file(process.env.STATE).json();
  s.added = (s.added ?? []).filter((a) => /^(checkout|env-file|env|config|connector):/.test(a));
  s.agents = {};
  await Bun.write(process.env.STATE, `${JSON.stringify(s, null, 2)}\n`);
'
note=${XDG_STATE_HOME:-$HOME/.local/state}/nimblebrain/install.json
[ -f "$note" ] && rm -f "$note"
step "done. The checkout stays at $dir, with its .env and state. Delete the folder yourself to remove it."
