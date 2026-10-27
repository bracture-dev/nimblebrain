#!/usr/bin/env bash
# Stop a NimbleBrain started by start.sh: the launcher, the API and the web server. It stops only a
# process group it can confirm is this checkout's (see owned in lib.sh), so a stale pid file after a
# reboot never stops another program.
#
# Usage: stop.sh <checkout> [--keep-examples]
#   --keep-examples  leave the showcase and GlassEngine running (connect.sh restarts only NimbleBrain)

set -euo pipefail

dir=$(cd "${1:?usage: stop.sh <checkout> [--keep-examples]}" && pwd -P)
. "$(dirname "$0")/lib.sh"
pidfile="$dir/.nimblebrain-worktree/dev.pid"

# Stop the bundled example apps first, if this setup started them.
if [ "${2:-}" != --keep-examples ] && [ -d "$dir/.nimblebrain-worktree/examples" ]; then
  bash "$(dirname "$0")/examples.sh" stop "$dir"
fi

if [ ! -f "$pidfile" ]; then
  echo "[stop] no $pidfile; if it runs in a terminal, press Ctrl+C there"
  exit 0
fi
api=$(env_value "$dir" NB_API_PORT)
stop_group "$pidfile" "$dir" "[stop]" "${api:-27271}"
