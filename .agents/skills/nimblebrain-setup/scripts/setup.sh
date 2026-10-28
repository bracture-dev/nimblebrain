#!/usr/bin/env bash
# The fast path, end to end and safe to re-run: checkout, dependencies, .env, NimbleBrain, the two
# examples, their connectors, a check, and this agent's own connection to the workspace. Each step
# finds what already exists (from either agent) and reuses it. Run it after the person's one yes.
#
# Usage: setup.sh --agent claude|codex [--dir <folder>] [--repo <owner/repo|url|path>] [--ref <ref>]
#                 [--api <port>] [--web <port>] [--showcase-port <port>] [--glass-port <port>]
#                 [--update]
#   defaults: --dir $NB_DIR or ~/nimblebrain, --repo NimbleBrainInc/nimblebrain, --ref main,
#             ports 27271/27270 and 27280/27281, or those recorded in a finished install.
#   --update  also fast-forward a checkout setup already recorded (otherwise it is left as it is).
# It first runs check.sh beside it and stops on any conflict marked "ask". Once the checkout exists,
# it runs the scripts inside it. It only adds: an existing value that differs is reported, never
# changed. Before its first edit of .env, nimblebrain.json or workspace.json it copies the file under
# .nimblebrain-worktree/backups/ (gitignored, readable only by you).
#
# Exit status: 0 done, 1 failed, 3 the person must decide (the line starting "ASK:" says what).
# Records the install, and everything it added, in <folder>/.nimblebrain-worktree/onboarding.json
# (gitignored with that folder), also when it stops part way. uninstall.sh reads that list to remove
# exactly what was added.

set -euo pipefail

agent="" dir=${NB_DIR:-$HOME/nimblebrain} repo=NimbleBrainInc/nimblebrain ref=main update=0
api="" web="" sc="" ge=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update) update=1; shift; continue ;;
    --agent) agent=$2 ;;
    --dir) dir=$2 ;;
    --repo) repo=$2 ;;
    --ref) ref=$2 ;;
    --api) api=$2 ;;
    --web) web=$2 ;;
    --showcase-port) sc=$2 ;;
    --glass-port) ge=$2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift 2
done
case "$agent" in claude | codex) ;; *) echo "usage: setup.sh --agent claude|codex [...]" >&2; exit 2 ;; esac
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
here=$(cd "$(dirname "$0")" && pwd -P)
. "$here/lib.sh"

step() { printf '[setup] %s\n' "$*"; }
ask() { printf 'ASK: %s\n' "$*" >&2; exit 3; }
changed=0
added=() # what this run adds to the person's setup, for uninstall.sh
args=(--agent "$agent" --dir "$dir" --repo "$repo" --ref "$ref")
[ -z "$api" ] || args+=(--api "$api")
[ -z "$web" ] || args+=(--web "$web")
[ -z "$sc" ] || args+=(--showcase-port "$sc")
[ -z "$ge" ] || args+=(--glass-port "$ge")
rc=0
[ ! -f "$here/check.sh" ] || bash "$here/check.sh" "${args[@]}" || rc=$?
[ "$rc" = 0 ] || { [ "$rc" = 3 ] && ask "resolve the conflicts above first (check.sh)"; exit 1; }
git --version >/dev/null 2>&1 || ask "git is missing. Offer the install command from references/prerequisites.md."
for tool in bun node curl; do
  command -v "$tool" >/dev/null 2>&1 || ask "$tool is missing. Offer the install command from references/prerequisites.md."
done

# Record what this run added, also when it stops part way (M1). The other agent's entries are kept.
state="" url="" ws="" head=""
save_state() {
  [ -n "$state" ] && [ -d "$(dirname "$state")" ] || return 0
  local handoff=${XDG_STATE_HOME:-$HOME/.local/state}/nimblebrain/install.json
  ADDED=$(printf '%s\n' "${added[@]+"${added[@]}"}") HANDOFF=$handoff STATE=$state DIR=$dir REPO=$url \
    REF=$ref API=$api WEB=$web SC=$sc GE=$ge WS=$ws AGENT=$agent HEAD=$head bun -e '
    const e = process.env;
    const old = await Bun.file(e.STATE).json().catch(() => ({}));
    // What install.sh added to the agents (marketplace, plugin) before this checkout existed.
    const handoff = await Bun.file(e.HANDOFF).json().catch(() => ({}));
    const fromInstall = Object.entries(handoff).flatMap(([a, v]) =>
      Object.entries(v ?? {}).filter(([, yes]) => yes === true).map(([k]) => `${a}-${k}`));
    const keep = (k, v) => (v === "" || v === undefined || Number.isNaN(v) ? old[k] : v);
    const next = {
      nbDir: e.DIR, repo: keep("repo", e.REPO), ref: e.REF,
      ports: { api: +e.API || old.ports?.api, web: +e.WEB || old.ports?.web, showcase: +e.SC || old.ports?.showcase, glass: +e.GE || old.ports?.glass },
      workspaceId: keep("workspaceId", e.WS), installedCommit: keep("installedCommit", e.HEAD),
      agents: { ...(old.agents ?? {}), ...(e.WS ? { [e.AGENT]: true } : {}) },
      added: [...new Set([...(old.added ?? []), ...fromInstall, ...e.ADDED.split("\n").filter(Boolean)])],
    };
    const { updatedAt: _, ...prev } = old;
    if (JSON.stringify(prev) !== JSON.stringify(next)) await Bun.write(e.STATE, `${JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  '
}
trap 'save_state' EXIT

# 1. Checkout. A new folder is cloned. A recorded install is left as it is unless --update. Another
#    checkout with the same origin and no local changes is fast-forwarded. Anything else: ask.
case "$repo" in
  /* | ./* | ../* | "~"*) url=$repo ;;
  *://* | git@*) url=$repo ;;
  *) url="https://github.com/$repo.git" ;;
esac
if [ ! -e "$dir" ] || [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
  step "cloning $url ($ref) into $dir"
  git clone --quiet --branch "$ref" "$url" "$dir" </dev/null
  added+=("checkout:$dir")
  changed=1
elif [ -e "$dir/.git" ]; then
  origin=$(git -C "$dir" remote get-url origin 2>/dev/null || echo none)
  [ "$(norm_source "$origin")" = "$(norm_source "$url")" ] ||
    ask "$dir is a checkout of $origin, not $url. Reuse it as is (pass --repo $origin), or choose another folder."
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] ||
    ask "$dir has uncommitted changes. Leave them and reuse the checkout as is, or choose another folder."
  if [ -f "$dir/.nimblebrain-worktree/onboarding.json" ] && [ "$update" = 0 ]; then
    step "checkout $dir is set up; left at $(git -C "$dir" rev-parse --short HEAD) (--update moves it forward)"
  elif ! git -C "$dir" symbolic-ref -q HEAD >/dev/null; then
    step "checkout $dir is on a tag or a fixed commit ($(git -C "$dir" rev-parse --short HEAD)); left as it is"
  else
    before=$(git -C "$dir" rev-parse HEAD)
    git -C "$dir" pull --quiet --ff-only </dev/null ||
      ask "git pull --ff-only failed in $dir (the branch has diverged). Reuse it as is, or choose another folder."
    if [ "$(git -C "$dir" rev-parse HEAD)" = "$before" ]; then
      step "checkout $dir is up to date"
    else
      step "checkout $dir updated to $(git -C "$dir" rev-parse --short HEAD)"
      changed=1
    fi
  fi
else
  ask "$dir exists and is not a git checkout. Choose another folder."
fi
dir=$(cd "$dir" && pwd -P)
scripts="$dir/.agents/skills/nimblebrain-setup/scripts"
work="$dir/.nimblebrain-worktree"
mkdir -p "$work"
state="$work/onboarding.json"
[ -f "$scripts/start.sh" ] || ask "$dir has no setup scripts (an older NimbleBrain). Follow SKILL.md step by step instead."

# A finished install's recorded ports win over the defaults, unless given on the command line.
api=${api:-$(state_port "$dir" api)} web=${web:-$(state_port "$dir" web)}
sc=${sc:-$(state_port "$dir" showcase)} ge=${ge:-$(state_port "$dir" glass)}

# 2. .env: create it once; later only append missing non-secret lines. Key lines are never touched.
envfile="$dir/.env"
api=${api:-$(env_value "$dir" NB_API_PORT)} web=${web:-$(env_value "$dir" NB_WEB_PORT)}
api=${api:-27271} web=${web:-27270} sc=${sc:-27280} ge=${ge:-27281}
if [ ! -f "$envfile" ]; then
  step "creating $envfile (chat inside NimbleBrain needs a key later; setup does not)"
  (umask 077 && printf '%s\n' "# NimbleBrain local settings. This file is gitignored. Restart after editing." \
    "ANTHROPIC_API_KEY=" >"$envfile")
  added+=("env-file:$envfile")
  changed=1
fi
for pair in "NB_API_PORT=$api" "NB_WEB_PORT=$web" "NB_PUBLIC_ORIGIN=http://localhost:$api" "NB_TELEMETRY_DISABLED=1"; do
  key=${pair%%=*}
  have=$(env_value "$dir" "$key")
  if [ -z "$have" ]; then
    backup_once "$dir" "$envfile"
    # A file whose last line has no newline would otherwise get our line glued onto it.
    [ -s "$envfile" ] && [ -n "$(tail -c 1 "$envfile")" ] && printf '\n' >>"$envfile"
    echo "$pair" >>"$envfile"
    added+=("env:$key")
    step "added $pair to .env"
    changed=1
  elif [ "$have" != "${pair#*=}" ]; then
    ask ".env has $key=$have but this run wants ${pair#*=}. Keep .env (rerun with matching --api/--web), or edit .env."
  fi
done

# 3. Dependencies, once per commit.
head=$(git -C "$dir" rev-parse HEAD)
installed=$(STATE=$state bun -e 'const s = await Bun.file(process.env.STATE).json().catch(() => ({})); console.log(s.installedCommit ?? "")')
if [ -d "$dir/node_modules" ] && [ "$installed" = "$head" ]; then
  step "dependencies already installed for $(git -C "$dir" rev-parse --short HEAD)"
else
  bash "$scripts/install.sh" "$dir"
  changed=1
fi
save_state

# 4. Run: the examples first (GlassEngine writes its token), then NimbleBrain, then the connectors.
#    Each script reuses what this checkout already runs and asks about anything else on its port.
#    A first start prints "listening on", "started" or "restarting"; a reuse prints "already".
run() {
  local out rc=0
  out=$("$@" 2>&1) || rc=$?
  out_last=$out
  echo "$out"
  [ "$rc" = 0 ] || exit "$rc"
  case "$out" in *"listening on"* | *started* | *restarting*) changed=1 ;; esac
}
run bash "$scripts/examples.sh" start "$dir" --showcase-port "$sc" --glass-port "$ge"
run bash "$scripts/start.sh" "$dir"
run bash "$scripts/connect.sh" "$dir" --showcase-port "$sc" --glass-port "$ge"
for item in $(printf '%s\n' "$out_last" | sed -n 's/^\[connect\] added //p'); do added+=("$item"); done
save_state
bash "$scripts/verify.sh" "$api" "$web"

ws=$(curl -fsS "http://127.0.0.1:$api/v1/bootstrap" | bun -e 'const j = await Bun.stdin.json(); console.log(j.workspaces?.[0]?.id ?? "")')
door="http://localhost:$api/mcp/$ws"

# 5. This agent's own entries. Identical: skip. Different: ask. Missing: add.
if [ "$agent" = claude ]; then
  case "$(claude plugin list </dev/null 2>/dev/null || true)" in *nimblebrain@nimblebrain*) ;; *) step "note: the nimblebrain plugin is not installed for Claude Code; install.sh adds it" ;; esac
  have=$(claude mcp get nimblebrain </dev/null 2>/dev/null | sed -n 's/^ *URL: //p' || true)
  if [ -z "$have" ]; then
    claude mcp add --transport http --scope user nimblebrain "$door" </dev/null >/dev/null
    added+=("claude-mcp:nimblebrain")
    step "Claude Code: added the workspace door nimblebrain -> $door"
    changed=1
  elif [ "$have" = "$door" ]; then
    step "Claude Code: workspace door already set ($door)"
  else
    ask "Claude Code already has an MCP server named nimblebrain at $have; this install's door is $door. Replace it (claude mcp remove nimblebrain -s user, then rerun), or keep it."
  fi
  for name in showcase glassengine; do
    other=$(claude mcp get "$name" </dev/null 2>/dev/null | sed -n 's/^ *URL: //p' || true)
    [ -z "$other" ] || step "note: Claude Code also has its own '$name' entry ($other); the plugin carries one too"
  done
else
  case "$(codex plugin list </dev/null 2>/dev/null || true)" in *nimblebrain*) ;; *) step "note: the nimblebrain plugin is not installed for Codex; install.sh --codex adds it" ;; esac
  # NimbleBrain's workspace door speaks MCP 2026-07-28, which Codex has behind this feature. Read
  # from config.toml: a feature the person set to false is theirs, so stop and ask.
  case "$(codex_feature mcp_2026_07_28)" in
    true) step "Codex: feature mcp_2026_07_28 already on" ;;
    false) ask "Codex has mcp_2026_07_28 = false in ${CODEX_HOME:-$HOME/.codex}/config.toml. Turn it on yourself (codex features enable mcp_2026_07_28) and rerun, or go on without it: nb-tool.sh still reaches NimbleBrain's tools." ;;
    *)
      codex features enable mcp_2026_07_28 </dev/null >/dev/null
      added+=("codex-feature:mcp_2026_07_28")
      step "Codex: turned on mcp_2026_07_28 (codex features disable mcp_2026_07_28 undoes it)"
      changed=1
      ;;
  esac
  have=$(codex mcp get nimblebrain --json </dev/null 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")' || true)
  if [ -z "$have" ]; then
    codex mcp add nimblebrain --url "$door" </dev/null >/dev/null
    added+=("codex-mcp:nimblebrain")
    step "Codex: added the workspace door nimblebrain -> $door"
    changed=1
  elif [ "$have" = "$door" ]; then
    step "Codex: workspace door already set ($door)"
  else
    ask "Codex already has an MCP server named nimblebrain at $have; this install's door is $door. Replace it (codex mcp remove nimblebrain, then rerun), or keep it."
  fi
fi

# 6. A Desktop shortcut that opens NimbleBrain in the default browser (macOS reads .webloc files).
#    It holds only the localhost address, so a Desktop that iCloud syncs copies nothing private.
shortcut="$HOME/Desktop/NimbleBrain.webloc"
webloc() {
  printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
    '<plist version="1.0">' '<dict>' '  <key>URL</key>' "  <string>http://localhost:$web</string>" '</dict>' '</plist>'
}
if [ ! -d "$HOME/Desktop" ]; then
  step "no Desktop folder; skipped the shortcut"
  shortcut=""
elif [ ! -e "$shortcut" ]; then
  webloc >"$shortcut"
  added+=("desktop:$shortcut")
  step "added $shortcut"
  changed=1
elif [ "$(cat "$shortcut")" = "$(webloc)" ]; then
  step "Desktop shortcut already in place"
else
  step "conflict: $shortcut exists with other content; left as it is (expected http://localhost:$web)"
  shortcut=""
fi

# Our shortcut gets NimbleBrain's icon, dark unless the Mac is in light mode. Setting it again is
# harmless; the file's content does not change. Paths go to osascript as arguments, never as code.
if [ -n "$shortcut" ] && [ "$(uname)" = Darwin ]; then
  variant=light
  [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null || true)" = Dark ] && variant=dark
  png="$dir/.agents/skills/nimblebrain-setup/assets/nimblebrain-icon-$variant-512.png"
  if [ -f "$png" ]; then
    osascript -l JavaScript -e 'ObjC.import("AppKit")' \
      -e 'function run(argv) { $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile(argv[0]), argv[1], 0) }' \
      "$png" "$shortcut" </dev/null >/dev/null || step "note: could not set the shortcut's icon"
  fi
fi

# 7. Record it (the EXIT trap does this too, for a run that stops part way).
save_state

[ "$changed" = 1 ] || step "already set up; nothing changed"
step "NimbleBrain:  http://localhost:$web"
step "GlassEngine:  http://localhost:$web/w/${ws#ws_}/app/glassengine"
step "door:         $door"
