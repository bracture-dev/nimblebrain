#!/usr/bin/env bash
# Install a NimbleBrain checkout's dependencies from its lockfiles and build the app UIs.
# Writes only inside the checkout (node_modules/ and src/platform/*/ui/dist/, both gitignored).
#
# Usage: install.sh <checkout>

set -euo pipefail

dir=$(cd "${1:?usage: install.sh <checkout>}" && pwd)
cd "$dir"

# Now that the checkout exists, compare Bun with its packageManager pin. Same minor release is fine.
pin=$(sed -n 's/.*"packageManager": *"bun@\([^"]*\)".*/\1/p' package.json | head -1)
have=$(bun --version)
if [ -n "$pin" ] && [ "${have%.*}" != "${pin%.*}" ]; then
  echo "[install] Bun $have does not match the pinned bun@$pin in package.json; see references/prerequisites.md" >&2
  exit 1
fi
echo "[install] Bun $have (package.json pins $pin)"

# Frozen: install exactly what bun.lock names, as CI and the container image do.
# --ignore-scripts: no package lifecycle scripts run; NimbleBrain needs none.
install() {
  echo "[install] $1"
  (cd "$1" && bun install --frozen-lockfile --ignore-scripts)
  if [ ! -d "$1/node_modules" ]; then
    echo "[install] bun install returned success, but $1/node_modules is missing." >&2
    echo "[install] Check npm/Bun dry-run settings (.npmrc or bunfig.toml); resolve the install restriction and rerun setup." >&2
    echo "[install] Package-manager settings were left unchanged." >&2
    return 1
  fi
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
