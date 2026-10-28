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
note=${XDG_STATE_HOME:-$HOME/.local/state}/nimblebrain/install.json
# Record each successful removal before the next command can fail.
mark_removed() {
  ITEM=$1 STATE=$state NOTE=$note bun --no-env-file -e '
    const { ITEM, STATE, NOTE } = process.env;
    const s = await Bun.file(STATE).json();
    s.added = (s.added ?? []).filter((a) => a !== ITEM);
    const agent = ITEM.match(/^(claude|codex)-mcp:nimblebrain$/)?.[1];
    if (agent) delete s.agents?.[agent];
    await Bun.write(STATE, `${JSON.stringify(s, null, 2)}\n`);
    const entry = ITEM.match(/^(claude|codex)-(plugin|marketplace)$/);
    if (entry && await Bun.file(NOTE).exists()) {
      const n = await Bun.file(NOTE).json();
      if (n[entry[1]]) delete n[entry[1]][entry[2]];
      await Bun.write(NOTE, `${JSON.stringify(n, null, 2)}\n`);
    }
  '
}
# The recorded source, in the form the agents list it.
want=$repo
[ -d "$repo" ] && want=$(cd "$repo" && pwd -P)

bash "$here/stop.sh" "$dir"

if has claude-mcp:nimblebrain && command -v claude >/dev/null; then
  u=$(claude mcp get nimblebrain </dev/null 2>/dev/null | sed -n 's/^ *URL: //p' || true)
  if [ "$u" = "$door" ]; then
    claude mcp remove nimblebrain -s user </dev/null >/dev/null
    mark_removed claude-mcp:nimblebrain
    step "removed Claude Code MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Claude Code MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-mcp:nimblebrain && command -v codex >/dev/null; then
  u=$(codex mcp get nimblebrain --json </dev/null 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")' || true)
  if [ "$u" = "$door" ]; then
    codex mcp remove nimblebrain </dev/null >/dev/null
    mark_removed codex-mcp:nimblebrain
    step "removed Codex MCP server nimblebrain"
  elif [ -n "$u" ]; then step "left Codex MCP server nimblebrain: it now points at $u"; fi
fi
if has codex-feature:mcp_2026_07_28; then
  cfg=${CODEX_HOME:-$HOME/.codex}/config.toml
  if [ ! -f "$cfg" ] || clear_codex_feature "$cfg" mcp_2026_07_28; then
    mark_removed codex-feature:mcp_2026_07_28
    step "restored the Codex feature setting setup introduced"
  fi
fi

# The Desktop shortcut, only while it still holds our address. It moves into the checkout, under a
# timestamped name, so an earlier one is never overwritten.
while IFS= read -r item; do
  [ -n "$item" ] || continue
  if [ -f "$item" ] && grep -q "<string>http://localhost:$web</string>" "$item"; then
    dest="$dir/.nimblebrain-worktree/NimbleBrain-$(date +%Y%m%d%H%M%S).webloc"
    mv "$item" "$dest"
    mark_removed "desktop:$item"
    step "moved the Desktop shortcut to $dest"
  fi
done < <(printf '%s\n' "$added" | sed -n 's/^desktop://p')

# Plugins and marketplaces: only those recorded as added, and only while the marketplace named
# nimblebrain still comes from the recorded source.
if command -v claude >/dev/null && { has claude-plugin || has claude-marketplace; }; then
  m=$(claude plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source claude "$want")
  if [ "$m" = same ]; then
    if has claude-plugin; then
      claude plugin uninstall nimblebrain@nimblebrain </dev/null >/dev/null
      mark_removed claude-plugin
      step "removed the Claude Code nimblebrain plugin"
    fi
    if has claude-marketplace; then
      remaining=$(claude plugin list --json </dev/null | bun --no-env-file -e 'const j = await Bun.stdin.json(); console.log(j.filter((p) => p.id?.endsWith("@nimblebrain")).length)')
      if [ "$remaining" = 0 ]; then
        claude plugin marketplace remove nimblebrain </dev/null >/dev/null
        mark_removed claude-marketplace
        step "removed the Claude Code nimblebrain marketplace"
      else step "left the Claude Code marketplace: it has another installed plugin"; fi
    fi
  elif [ "$m" != absent ]; then
    step "left the Claude Code nimblebrain marketplace: it now comes from ${m#other }"
  fi
fi
if command -v codex >/dev/null && { has codex-plugin || has codex-marketplace; }; then
  m=$(codex plugin marketplace list --json </dev/null 2>/dev/null | marketplace_source codex "$want")
  if [ "$m" = same ]; then
    if has codex-plugin; then
      codex plugin remove nimblebrain@nimblebrain </dev/null >/dev/null
      mark_removed codex-plugin
      step "removed the Codex nimblebrain plugin"
    fi
    if has codex-marketplace; then
      remaining=$(codex plugin list --json </dev/null | bun --no-env-file -e 'const j = await Bun.stdin.json(); console.log((j.installed ?? []).filter((p) => p.installed && p.pluginId?.endsWith("@nimblebrain")).length)')
      if [ "$remaining" = 0 ]; then
        codex plugin marketplace remove nimblebrain </dev/null >/dev/null
        mark_removed codex-marketplace
        step "removed the Codex nimblebrain marketplace"
      else step "left the Codex marketplace: it has another installed plugin"; fi
    fi
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

step "done. The checkout stays at $dir, with its .env and state. Delete the folder yourself to remove it."
