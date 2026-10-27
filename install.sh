#!/usr/bin/env bash
# NimbleBrain local setup in one command. Installs the NimbleBrain plugin for your coding agent,
# then opens the agent on the setup, which shows one plan and asks once before it changes anything.
#
#   curl -fsSL https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/install.sh | bash
#   ... | bash -s -- --codex      use Codex when Claude Code is also installed
#
# NB_REPO   owner/repo or a local checkout (default NimbleBrainInc/nimblebrain)
# NB_REF    branch or tag (default main; ignored for a local checkout)
# NB_NO_LAUNCH=1   install the plugin only; print the command that starts setup
#
# Adds to your agent's own settings only: the plugin marketplace and plugin named nimblebrain. It
# never removes or replaces anything, and never uses sudo. Safe to run again: a second run updates
# the plugin. Exit status 3 means it found a conflict and changed nothing. What it added is noted in
# ~/.local/state/nimblebrain/install.json, so the setup can record it and an uninstall removes
# exactly that.

# Everything runs inside main, so a download cut off half way runs nothing.
main() {
  set -eu
  local repo=${NB_REPO:-NimbleBrainInc/nimblebrain} ref=${NB_REF:-main} agent="" arg
  for arg in "$@"; do
    case $arg in
      --codex) agent=codex ;;
      --claude) agent=claude ;;
      *) echo "unknown option: $arg (use --codex or --claude)" >&2; exit 2 ;;
    esac
  done

  step() { printf '==> %s\n' "$*"; }
  have() { command -v "$1" >/dev/null 2>&1; }

  if [ -z "$agent" ]; then
    if have claude; then agent=claude; elif have codex; then agent=codex; fi
  fi
  if [ -z "$agent" ] || ! have "$agent"; then
    case $agent in
      codex) echo "Codex is not installed. Install it (npm install -g @openai/codex), then run this again." ;;
      *) echo "Claude Code is not installed. Install it (curl -fsSL https://claude.ai/install.sh | bash), then run this again." ;;
    esac
    exit 1
  fi

  # The marketplace entry named nimblebrain, from the agent's own JSON listing: absent, same or other.
  # Uses bun or node when present. Without either, an existing entry counts as other, so we ask.
  source_state() { # <json on stdin> <wanted source>
    local js='
      const fs = require("node:fs");
      let raw = null; try { raw = JSON.parse(fs.readFileSync(0, "utf8")); } catch {}
      const list = Array.isArray(raw) ? raw : (raw && raw.marketplaces) || [];
      const m = list.find((x) => x.name === "nimblebrain");
      if (!m) { console.log("absent"); process.exit(0); }
      const s = m.marketplaceSource || {};
      const have = m.repo || m.url || m.path || s.source || m.root || "";
      const norm = (v) => {
        let u = String(v).trim().replace(/#.*$/, "").replace(/\/+$/, "").replace(/\.git$/, "");
        try { if (u.startsWith("/")) u = fs.realpathSync(u); } catch {}
        return u.replace(/^(https?:\/\/|git@)github\.com[\/:]/, "").toLowerCase();
      };
      console.log(norm(have) === norm(process.argv[process.argv.length - 1]) ? "same" : "other " + have);'
    if have bun; then bun -e "$js" -- "$1"
    elif have node; then node -e "$js" -- "$1"
    else
      case "$(cat)" in *'"nimblebrain"'*) echo "other (cannot read it without bun or node)" ;; *) echo absent ;; esac
    fi
  }
  want=$repo
  [ -d "$repo" ] && want=$(cd "$repo" && pwd -P)
  conflict() {
    echo "ASK: $1 already has a plugin marketplace named nimblebrain from ${2#other }; left as it is." >&2
    echo "     To use $repo instead, remove that marketplace yourself, then run this again." >&2
    exit 3
  }
  added_marketplace=false added_plugin=false

  if [ "$agent" = claude ]; then
    local src=$repo
    [ -d "$repo" ] || src="$repo#$ref"
    m=$(claude plugin marketplace list --json </dev/null 2>/dev/null | source_state "$want")
    case "$m" in
      other*) conflict "Claude Code" "$m" ;;
      same)
        step "Claude Code: updating the nimblebrain plugin source"
        claude plugin marketplace update nimblebrain </dev/null ;;
      *)
        step "Claude Code: adding the plugin source $src"
        claude plugin marketplace add "$src" </dev/null
        added_marketplace=true ;;
    esac
    if claude plugin list </dev/null 2>/dev/null | grep -q 'nimblebrain@nimblebrain'; then
      step "Claude Code: updating the nimblebrain plugin"
      claude plugin update nimblebrain@nimblebrain </dev/null >/dev/null
    else
      step "Claude Code: installing the nimblebrain plugin"
      claude plugin install nimblebrain@nimblebrain </dev/null
      added_plugin=true
    fi
  else
    m=$(codex plugin marketplace list --json </dev/null 2>/dev/null | source_state "$want")
    case "$m" in
      other*) conflict "Codex" "$m" ;;
      same)
        step "Codex: the nimblebrain plugin source is already added"
        [ -d "$repo" ] || codex plugin marketplace upgrade nimblebrain </dev/null ;;
      *)
        if [ -d "$repo" ]; then
          step "Codex: adding the plugin source $repo"
          codex plugin marketplace add "$repo" </dev/null
        else
          step "Codex: adding the plugin source $repo at $ref"
          codex plugin marketplace add "$repo" --ref "$ref" </dev/null
        fi
        added_marketplace=true ;;
    esac
    if codex plugin list </dev/null 2>/dev/null | grep -q 'nimblebrain@nimblebrain.*installed\|nimblebrain@nimblebrain.*enabled'; then
      step "Codex: the nimblebrain plugin is installed"
    else
      step "Codex: installing the nimblebrain plugin"
      codex plugin add nimblebrain@nimblebrain </dev/null
      added_plugin=true
    fi
  fi

  # Note what this run added, for the setup to record. Earlier notes for the agent are kept.
  local note=${XDG_STATE_HOME:-$HOME/.local/state}/nimblebrain/install.json
  if [ "$added_marketplace$added_plugin" != falsefalse ] && { have bun || have node; }; then
    mkdir -p "$(dirname "$note")"
    local js='
      const fs = require("node:fs"); const [f, a, m, p] = process.argv.slice(-4);
      let o = {}; try { o = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      o[a] = { ...(o[a] || {}), ...(m === "true" ? { marketplace: true } : {}), ...(p === "true" ? { plugin: true } : {}) };
      fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n");'
    if have bun; then bun -e "$js" -- "$note" "$agent" "$added_marketplace" "$added_plugin"
    else node -e "$js" -- "$note" "$agent" "$added_marketplace" "$added_plugin"; fi
  fi

  # The setup clones the same source the plugin came from.
  local source_note=""
  if [ "$repo" != NimbleBrainInc/nimblebrain ] || [ "$ref" != main ]; then
    source_note=" Clone NimbleBrain from $repo"
    [ -d "$repo" ] || source_note="$source_note at $ref"
    source_note="$source_note."
  fi
  if [ "$agent" = claude ]; then
    # The plugin's own local tools (GlassEngine and the showcase) run without a prompt each time.
    set -- claude "/nimblebrain:setup${source_note}" \
      --allowedTools "mcp__plugin_nimblebrain_glassengine__*" "mcp__plugin_nimblebrain_showcase__*"
  else
    set -- codex "Use the nimblebrain-setup skill to set up NimbleBrain on this machine, fast path.${source_note}"
  fi

  if [ -n "${NB_NO_LAUNCH:-}" ] || ! ( : </dev/tty ) 2>/dev/null; then
    step "Plugin ready. To start setup, run:"
    printf '    %s' "$1"; shift; printf ' "%s"' "$@"; printf '\n'
    exit 0
  fi
  step "Starting $agent on the setup. Say yes to its plan."
  exec "$@" </dev/tty
}

main "$@"
