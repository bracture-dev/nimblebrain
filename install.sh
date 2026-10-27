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
# Changes only your agent's own settings: the plugin marketplace and plugin, and for Codex the
# mcp_2026_07_28 feature. No sudo, nothing machine-wide.

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

if [ "$agent" = claude ]; then
  if [ -d "$repo" ]; then src=$repo; else src="$repo#$ref"; fi
  step "Claude Code: removing any earlier NimbleBrain plugin source"
  claude plugin marketplace remove nimblebrain >/dev/null 2>&1 || true
  step "Claude Code: adding the plugin source $src"
  claude plugin marketplace add "$src"
  step "Claude Code: installing the nimblebrain plugin"
  claude plugin install nimblebrain@nimblebrain
  # The plugin's own local tools (GlassEngine and the showcase) run without a prompt each time.
  set -- claude "/nimblebrain:setup${source_note}" \
    --allowedTools "mcp__plugin_nimblebrain_glassengine__*" "mcp__plugin_nimblebrain_showcase__*"
else
  step "Codex: removing any earlier NimbleBrain plugin source"
  codex plugin marketplace remove nimblebrain >/dev/null 2>&1 || true
  if [ -d "$repo" ]; then
    step "Codex: adding the plugin source $repo"
    codex plugin marketplace add "$repo"
  else
    step "Codex: adding the plugin source $repo at $ref"
    codex plugin marketplace add "$repo" --ref "$ref"
  fi
  step "Codex: installing the nimblebrain plugin"
  codex plugin add nimblebrain@nimblebrain
  # NimbleBrain's workspace door speaks MCP 2026-07-28, which Codex has behind this feature.
  step "Codex: turning on the mcp_2026_07_28 feature (codex features disable mcp_2026_07_28 undoes it)"
  codex features enable mcp_2026_07_28
  set -- codex "Use the nimblebrain-setup skill to set up NimbleBrain on this machine, fast path.${source_note}"
fi

if [ -n "${NB_NO_LAUNCH:-}" ] || ! [ -r /dev/tty ]; then
  step "Plugin installed. To start setup, run:"
  printf '    %s' "$1"; shift; printf ' "%s"' "$@"; printf '\n'
  exit 0
fi
step "Starting $agent on the setup. Say yes to its plan."
exec "$@" </dev/tty
