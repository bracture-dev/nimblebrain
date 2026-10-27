#!/usr/bin/env bash
# Install a NimbleBrain checkout's dependencies from its lockfiles and build the app UIs.
# Writes only inside the checkout (node_modules/ and src/platform/*/ui/dist/, both gitignored).
#
# Usage: install.sh <checkout>

set -euo pipefail

dir=$(cd "${1:?usage: install.sh <checkout>}" && pwd)
cd "$dir"

# Frozen: install exactly what bun.lock names, as CI and the container image do.
# --ignore-scripts: no package lifecycle scripts run; NimbleBrain needs none.
install() {
  echo "[install] $1"
  (cd "$1" && bun install --frozen-lockfile --ignore-scripts)
}

install .
install web
for ui in src/platform/*/ui; do
  [ -f "$ui/package.json" ] || continue
  install "$ui"
  echo "[install] build $ui"
  (cd "$ui" && bun run build)
done

echo "[install] done: $dir"
