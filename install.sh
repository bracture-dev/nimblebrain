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
# never removes or replaces anything. No sudo, nothing machine-wide. Safe to run again: a second run
# updates the plugin. Exit status 3 means it found a conflict and changed nothing.

set -eu

repo=${NB_REPO:-NimbleBrainInc/nimblebrain}
ref=${NB_REF:-main}
agent=""
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

# The setup reads these to clone the same source the plugin came from.
source_note=""
if [ "$repo" != NimbleBrainInc/nimblebrain ] || [ "$ref" != main ]; then
  source_note=" Clone NimbleBrain from $repo"
  [ -d "$repo" ] || source_note="$source_note at $ref"
  source_note="$source_note."
fi

# Adds or updates only the marketplace and plugin named nimblebrain. A marketplace of that name from
# another source is never replaced: the script stops and says so.
if [ "$agent" = claude ]; then
  if [ -d "$repo" ]; then src=$repo; else src="$repo#$ref"; fi
  known=$(claude plugin marketplace list --json 2>/dev/null | tr -d ' \n' || true)
  case "$known" in
    *'"name":"nimblebrain"'*)
      case "$known" in *"${repo}"*) ;; *)
        echo "ASK: Claude Code already has a plugin marketplace named nimblebrain from another source; left as it is." >&2
        echo "     To use $src instead: claude plugin marketplace remove nimblebrain, then run this again." >&2
        exit 3 ;;
      esac
      step "Claude Code: updating the nimblebrain plugin source"
      claude plugin marketplace update nimblebrain ;;
    *)
      step "Claude Code: adding the plugin source $src"
      claude plugin marketplace add "$src" ;;
  esac
  step "Claude Code: installing or updating the nimblebrain plugin"
  claude plugin install nimblebrain@nimblebrain
  claude plugin update nimblebrain@nimblebrain >/dev/null
  # The plugin's own local tools (GlassEngine and the showcase) run without a prompt each time.
  set -- claude "/nimblebrain:setup${source_note}" \
    --allowedTools "mcp__plugin_nimblebrain_glassengine__*" "mcp__plugin_nimblebrain_showcase__*"
else
  if [ -d "$repo" ]; then set -- "$repo"; else set -- "$repo" --ref "$ref"; fi
  step "Codex: adding the plugin source $*"
  # Codex refuses a second source under the same name, so a different one is never replaced.
  if ! out=$(codex plugin marketplace add "$@" 2>&1); then
    echo "$out" >&2
    echo "ASK: Codex already has a plugin marketplace named nimblebrain from another source; left as it is." >&2
    echo "     To use $* instead: codex plugin marketplace remove nimblebrain, then run this again." >&2
    exit 3
  fi
  echo "$out"
  [ -d "$repo" ] || codex plugin marketplace upgrade nimblebrain >/dev/null 2>&1 || true
  step "Codex: installing or updating the nimblebrain plugin"
  codex plugin add nimblebrain@nimblebrain
  set -- codex "Use the nimblebrain-setup skill to set up NimbleBrain on this machine, fast path.${source_note}"
fi

if [ -n "${NB_NO_LAUNCH:-}" ] || ! [ -r /dev/tty ]; then
  step "Plugin installed. To start setup, run:"
  printf '    %s' "$1"; shift; printf ' "%s"' "$@"; printf '\n'
  exit 0
fi
step "Starting $agent on the setup. Say yes to its plan."
exec "$@" </dev/tty
