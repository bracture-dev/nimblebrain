#!/usr/bin/env bash
# The fast path, end to end and safe to re-run: checkout, dependencies, .env, NimbleBrain, the two
# examples, their connectors, a check, and this agent's own connection to the workspace. Each step
# finds what already exists (from either agent) and reuses it. Run it after the person's one yes.
#
# Usage: setup.sh --agent claude|codex [--dir <folder>] [--repo <owner/repo|url|path>] [--ref <ref>]
#                 [--api <port>] [--web <port>] [--showcase-port <port>] [--glass-port <port>]
#   defaults: --dir $NB_DIR or ~/nimblebrain, --repo NimbleBrainInc/nimblebrain, --ref main,
#             ports 27271/27270 and 27280/27281, or those recorded in a finished install.
# It needs only itself: once the checkout exists, it runs the scripts inside it.
#
# Exit status: 0 done, 1 failed, 3 the person must decide (the line starting "ASK:" says what).
# Records the install in <folder>/.nimblebrain-worktree/onboarding.json (gitignored with that folder).

set -euo pipefail

agent="" dir=${NB_DIR:-$HOME/nimblebrain} repo=NimbleBrainInc/nimblebrain ref=main
api="" web="" sc="" ge=""
while [ $# -gt 0 ]; do
  case "$1" in
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

step() { printf '[setup] %s\n' "$*"; }
ask() { printf 'ASK: %s\n' "$*" >&2; exit 3; }
changed=0
for tool in git bun node curl; do
  command -v "$tool" >/dev/null 2>&1 || ask "$tool is missing. Offer the install command from references/prerequisites.md."
done

# 1. Checkout. Same origin and clean: update. Anything else: ask.
case "$repo" in
  /* | ./* | ../* | ~*) url=$repo ;;
  *://* | git@*) url=$repo ;;
  *) url="https://github.com/$repo.git" ;;
esac
norm() { local u=${1%/}; u=${u%.git}; [ -d "$u" ] && u=$(cd "$u" && pwd -P); echo "$u"; }
if [ ! -e "$dir" ] || [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
  step "cloning $url ($ref) into $dir"
  git clone --quiet --branch "$ref" "$url" "$dir"
  changed=1
elif [ -d "$dir/.git" ] || [ -f "$dir/.git" ]; then
  origin=$(git -C "$dir" remote get-url origin 2>/dev/null || echo none)
  [ "$(norm "$origin")" = "$(norm "$url")" ] ||
    ask "$dir is a checkout of $origin, not $url. Reuse it as is (pass --repo $origin), or choose another folder."
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] ||
    ask "$dir has uncommitted changes. Leave them and reuse the checkout as is, or choose another folder."
  before=$(git -C "$dir" rev-parse HEAD)
  git -C "$dir" pull --quiet --ff-only ||
    ask "git pull --ff-only failed in $dir (the branch has diverged). Reuse it as is, or choose another folder."
  if [ "$(git -C "$dir" rev-parse HEAD)" = "$before" ]; then
    step "checkout $dir is up to date"
  else
    step "checkout $dir updated to $(git -C "$dir" rev-parse --short HEAD)"
    changed=1
  fi
else
  ask "$dir exists and is not a git checkout. Choose another folder."
fi
dir=$(cd "$dir" && pwd -P)
scripts="$dir/.agents/skills/nimblebrain-setup/scripts"
work="$dir/.nimblebrain-worktree"
state="$work/onboarding.json"
[ -f "$scripts/start.sh" ] || ask "$dir has no setup scripts (an older NimbleBrain). Follow SKILL.md step by step instead."

# A finished install's recorded ports win over the defaults, unless given on the command line.
recorded() { [ -f "$state" ] && STATE=$state K=$1 bun -e 'const s = await Bun.file(process.env.STATE).json(); console.log(s.ports?.[process.env.K] ?? "")' || true; }
api=${api:-$(recorded api)} web=${web:-$(recorded web)}
sc=${sc:-$(recorded showcase)} ge=${ge:-$(recorded glass)}

# 2. .env: create it once; later only append missing non-secret lines. Key lines are never touched.
envfile="$dir/.env"
envval() { [ -f "$envfile" ] && sed -n "s/^$1=\(.*\)/\1/p" "$envfile" | tail -1 || true; }
api=${api:-$(envval NB_API_PORT)} web=${web:-$(envval NB_WEB_PORT)}
api=${api:-27271} web=${web:-27270} sc=${sc:-27280} ge=${ge:-27281}
if [ ! -f "$envfile" ]; then
  step "creating $envfile (chat inside NimbleBrain needs a key there later; setup does not)"
  printf '%s\n' "# NimbleBrain local settings. This file is gitignored. Restart after editing." \
    "ANTHROPIC_API_KEY=" >"$envfile"
  changed=1
fi
for pair in "NB_API_PORT=$api" "NB_WEB_PORT=$web" "NB_PUBLIC_ORIGIN=http://localhost:$api" "NB_TELEMETRY_DISABLED=1"; do
  key=${pair%%=*}
  have=$(envval "$key")
  if [ -z "$have" ]; then
    echo "$pair" >>"$envfile"
    step "added $pair to .env"
    changed=1
  elif [ "$have" != "${pair#*=}" ]; then
    ask ".env has $key=$have but this run wants ${pair#*=}. Keep .env (rerun with matching --api/--web), or edit .env."
  fi
done

# 3. Dependencies, once per commit.
head=$(git -C "$dir" rev-parse HEAD)
if [ -d "$dir/node_modules" ] && [ "$(STATE=$state bun -e 'const s = await Bun.file(process.env.STATE).json().catch(() => ({})); console.log(s.installedCommit ?? "")')" = "$head" ]; then
  step "dependencies already installed for $(git -C "$dir" rev-parse --short HEAD)"
else
  bash "$scripts/install.sh" "$dir"
  changed=1
fi

# 4. Run: the examples first (GlassEngine writes its token), then NimbleBrain, then the connectors.
#    Each script reuses what this checkout already runs and asks about anything else on its port.
#    A first start prints "listening on", "started" or "restarting"; a reuse prints "already".
run() {
  local out rc=0
  out=$("$@" 2>&1) || rc=$?
  echo "$out"
  [ "$rc" = 0 ] || exit "$rc"
  case "$out" in *"listening on"* | *started* | *restarting*) changed=1 ;; esac
}
run bash "$scripts/examples.sh" start "$dir" --showcase-port "$sc" --glass-port "$ge"
run bash "$scripts/start.sh" "$dir"
run bash "$scripts/connect.sh" "$dir" --showcase-port "$sc" --glass-port "$ge"
bash "$scripts/verify.sh" "$api" "$web"

ws=$(curl -fsS "http://127.0.0.1:$api/v1/bootstrap" | bun -e 'const j = await Bun.stdin.json(); console.log(j.workspaces?.[0]?.id ?? "")')
door="http://localhost:$api/mcp/$ws"

# 5. This agent's own entries. Identical: skip. Different: ask. Missing: add.
if [ "$agent" = claude ]; then
  case "$(claude plugin list 2>/dev/null || true)" in *nimblebrain@nimblebrain*) ;; *) step "note: the nimblebrain plugin is not installed for Claude Code; install.sh adds it" ;; esac
  have=$(claude mcp get nimblebrain 2>/dev/null | sed -n 's/^ *URL: //p' || true)
  if [ -z "$have" ]; then
    claude mcp add --transport http --scope user nimblebrain "$door" >/dev/null
    step "Claude Code: added the workspace door nimblebrain -> $door"
    changed=1
  elif [ "$have" = "$door" ]; then
    step "Claude Code: workspace door already set ($door)"
  else
    ask "Claude Code already has an MCP server named nimblebrain at $have; this install's door is $door. Replace it (claude mcp remove nimblebrain -s user, then rerun), or keep it."
  fi
  for name in showcase glassengine; do
    other=$(claude mcp get "$name" 2>/dev/null | sed -n 's/^ *URL: //p' || true)
    [ -z "$other" ] || step "note: Claude Code also has its own '$name' entry ($other); the plugin carries one too"
  done
else
  case "$(codex plugin list 2>/dev/null || true)" in *nimblebrain*) ;; *) step "note: the nimblebrain plugin is not installed for Codex; install.sh --codex adds it" ;; esac
  if [ "$(codex features list 2>/dev/null | awk '$1 == "mcp_2026_07_28" { print $NF }' || true)" = true ]; then
    step "Codex: feature mcp_2026_07_28 already on"
  else
    codex features enable mcp_2026_07_28 >/dev/null 2>&1
    step "Codex: turned on mcp_2026_07_28 (codex features disable mcp_2026_07_28 undoes it)"
    changed=1
  fi
  have=$(codex mcp get nimblebrain --json 2>/dev/null | bun -e 'const j = await Bun.stdin.json().catch(() => ({})); console.log(j.transport?.url ?? "")' || true)
  if [ -z "$have" ]; then
    codex mcp add nimblebrain --url "$door" >/dev/null
    step "Codex: added the workspace door nimblebrain -> $door"
    changed=1
  elif [ "$have" = "$door" ]; then
    step "Codex: workspace door already set ($door)"
  else
    ask "Codex already has an MCP server named nimblebrain at $have; this install's door is $door. Replace it (codex mcp remove nimblebrain, then rerun), or keep it."
  fi
fi

# 6. Record it, keeping the other agent's entry.
STATE=$state DIR=$dir REPO=$url REF=$ref API=$api WEB=$web SC=$sc GE=$ge WS=$ws AGENT=$agent HEAD=$head bun -e '
  const e = process.env;
  const old = await Bun.file(e.STATE).json().catch(() => ({}));
  const next = {
    nbDir: e.DIR, repo: e.REPO, ref: e.REF,
    ports: { api: +e.API, web: +e.WEB, showcase: +e.SC, glass: +e.GE },
    workspaceId: e.WS, installedCommit: e.HEAD,
    agents: { ...(old.agents ?? {}), [e.AGENT]: true },
  };
  const { updatedAt: _, ...prev } = old;
  if (JSON.stringify(prev) !== JSON.stringify(next)) await Bun.write(e.STATE, `${JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2)}\n`);
'

[ "$changed" = 1 ] || step "already set up; nothing changed"
step "NimbleBrain:  http://localhost:$web"
step "GlassEngine:  http://localhost:$web/w/${ws#ws_}/app/glassengine"
step "door:         $door"
