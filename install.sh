#!/usr/bin/env bash
# NimbleBrain local setup in one command. Installs the NimbleBrain plugin for your coding agent,
# starts the local servers, then opens the agent with its connections ready.
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
  # Whether nimblebrain@nimblebrain is installed, from the agent's JSON plugin listing on stdin.
  plugin_installed() {
    local js='
      const fs = require("node:fs");
      let raw = null; try { raw = JSON.parse(fs.readFileSync(0, "utf8")); } catch {}
      const id = "nimblebrain@nimblebrain";
      const yes = Array.isArray(raw) ? raw.some((p) => p.id === id)
        : ((raw && raw.installed) || []).some((p) => p.pluginId === id && p.installed);
      console.log(yes ? "yes" : "no");'
    if have bun; then bun -e "$js"
    elif have node; then node -e "$js"
    else case "$(cat)" in *'nimblebrain@nimblebrain'*) echo yes ;; *) echo no ;; esac
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

  # An existing session uses the plugin-only route and runs setup itself. In a terminal, check
  # first and start the servers before the new agent tries to connect to them.
  local scripts="" bootstrap="" terminal_setup=false
  if [ -z "${NB_NO_LAUNCH:-}" ] && ( : </dev/tty ) 2>/dev/null; then
    terminal_setup=true
    if [ -d "$repo" ]; then
      scripts="$want/.agents/skills/nimblebrain-setup/scripts"
    else
      bootstrap=$(mktemp -d "${TMPDIR:-/tmp}/nimblebrain-setup.XXXXXX")
      trap 'rm -rf "$bootstrap"' EXIT
      scripts=$bootstrap
      for arg in check.sh lib.sh setup.sh; do
        curl -fsSL "https://raw.githubusercontent.com/$repo/$ref/.agents/skills/nimblebrain-setup/scripts/$arg" -o "$scripts/$arg"
      done
    fi
    local check_status=0
    bash "$scripts/check.sh" --agent "$agent" --dir "${NB_DIR:-$HOME/nimblebrain}" --repo "$repo" --ref "$ref" || check_status=$?
    if [ "$check_status" != 0 ]; then
      if ! git --version >/dev/null 2>&1; then
        if [ "$(uname)" = Darwin ]; then echo "Install git: xcode-select --install"
        else echo "Install git with your system package manager (Debian/Ubuntu: sudo apt-get install git)."; fi
      fi
      if ! have bun; then
        if have brew; then echo "Install Bun: brew install oven-sh/bun/bun"
        else echo 'Install the pinned Bun: curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"'; fi
      fi
      if ! have node || [ "$(node --version | sed 's/^v//' | cut -d. -f1)" -lt 22 ]; then
        if have brew; then echo "Install Node.js 22+: brew install node"
        else echo "Install Node.js 22+: https://nodejs.org/en/download"; fi
      fi
      echo "Resolve the conflicts above, then rerun the same setup command. Nothing was changed."
      exit "$check_status"
    fi
    printf '%s\n' \
      "Set up NimbleBrain in ${NB_DIR:-$HOME/nimblebrain}, with telemetry off." \
      "Install the plugin, dependencies, showcase and GlassEngine; connect $agent; add a Desktop shortcut." \
      "Reuse this install's recorded ports, or use localhost 27270/27271 and 27280/27281 for a new install." \
      "Enable the local HTTP connectors. NimbleBrain chat can use your own provider key later."
    if [ "$agent" = codex ]; then
      echo "This turns on a Codex feature still marked under development, for every project on this machine. codex features disable mcp_2026_07_28 turns it off again."
    fi
    printf 'Go ahead? [y/N] '
    local answer
    IFS= read -r answer </dev/tty || exit 1
    case "$answer" in y | Y | yes | YES) ;; *) echo "Setup cancelled; nothing changed."; exit 0 ;; esac
  fi

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
    if [ "$(claude plugin list --json </dev/null 2>/dev/null | plugin_installed)" = yes ]; then
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
    if [ "$(codex plugin list --json </dev/null 2>/dev/null | plugin_installed)" = yes ]; then
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

  if [ "$terminal_setup" = true ]; then
    bash "$scripts/setup.sh" --agent "$agent" --dir "${NB_DIR:-$HOME/nimblebrain}" --repo "$repo" --ref "$ref"
    [ -z "$bootstrap" ] || rm -rf "$bootstrap"
    trap - EXIT
  fi

  local handoff="Local services are running. The terminal installer has completed setup and health verification for ${NB_DIR:-$HOME/nimblebrain} (source $repo, ref $ref). Finish this session's connection using native MCP tools: check NimbleBrain workspace status, read the Showcase checklist without changing progress, and list GlassEngine tabs. Join or reuse this session as $agent, report ready, then keep answering with wait_for_message. Ask before taking another session's tab. Repeat shell setup only if a connection check fails. Provider keys, preferences and the tour are optional afterward, only on request."
  if [ "$agent" = claude ]; then
    # The plugin's own local tools (GlassEngine and the showcase) run without a prompt each time.
    set -- claude "$handoff" \
      --allowedTools "mcp__plugin_nimblebrain_glassengine__*" "mcp__plugin_nimblebrain_showcase__*"
  else
    set -- codex "$handoff"
  fi

  if [ -n "${NB_NO_LAUNCH:-}" ] || ! ( : </dev/tty ) 2>/dev/null; then
    step "Plugin ready. In your agent, ask it to follow the nimblebrain-setup skill."
    exit 0
  fi
  step "Local servers ready. Starting $agent to join GlassEngine."
  if [ -t 0 ]; then exec "$@"; fi
  # Bun on macOS cannot watch the /dev/tty alias. A piped install needs the
  # process's actual terminal device, while a script run keeps its original stdin.
  local terminal
  terminal=$(ps -p $$ -o tty= | tr -d '[:space:]')
  case $terminal in
    /dev/*) ;;
    '' | '?' | '??') echo "Open a terminal and run $agent to join GlassEngine." >&2; exit 1 ;;
    *) terminal="/dev/$terminal" ;;
  esac
  exec "$@" <"$terminal"
}

main "$@"
