# Helpers shared by the nimblebrain-setup scripts. Sourced, not run.

# Git may rewrite HTTPS to SSH. Compare repository identity without changing either remote.
norm_source() {
  local u=${1%/}
  u=${u%.git}
  if [ -d "$u" ]; then (cd "$u" && pwd -P); return; fi
  case "$u" in
    https://github.com/*) u=${u#https://github.com/} ;;
    http://github.com/*) u=${u#http://github.com/} ;;
    git@github.com:*) u=${u#git@github.com:} ;;
    ssh://git@github.com/*) u=${u#ssh://git@github.com/} ;;
    *) printf '%s\n' "$u"; return ;;
  esac
  printf 'github.com/%s\n' "$u" | tr '[:upper:]' '[:lower:]'
}

# Anything accepting connections on the port, over IPv4 or IPv6 loopback.
port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && return 0
  return 1
}

# Start a command in its own process group and record "<pgid>" and the command in a pid file.
# Usage: launch <pidfile> <log> <workdir> <command...>
launch() {
  local pidfile=$1 log=$2 cwd=$3
  shift 3
  set -m
  (cd "$cwd" && exec nohup "$@" >"$log" 2>&1) </dev/null >/dev/null 2>&1 &
  printf '%s\n%s\n' "$!" "$*" >"$pidfile"
  set +m
}

# True when the pid file names a live process group that is really ours: its leader still runs the
# recorded command from inside <dir>, or a listener on <port> belongs to the group. After a reboot a
# recorded number can belong to another program; this keeps us from reusing or stopping it.
# Usage: owned <pidfile> <dir> [<port>]
owned() {
  local pidfile=$1 dir=$2 port=${3:-} pgid cmd now cwd p
  [ -s "$pidfile" ] || return 1
  pgid=$(sed -n 1p "$pidfile")
  cmd=$(sed -n 2p "$pidfile")
  case "$pgid" in '' | *[!0-9]*) return 1 ;; esac
  kill -0 "-$pgid" 2>/dev/null || return 1
  now=$(ps -o command= -p "$pgid" 2>/dev/null || true)
  cwd=$(lsof -a -p "$pgid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  if [ -n "$cmd" ] && [ -n "$now" ] && case "$now" in *"$cmd"*) true ;; *) false ;; esac; then
    case "$cwd" in "$dir" | "$dir"/*) return 0 ;; esac
  fi
  if [ -n "$port" ]; then
    for p in $(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
      [ "$(ps -o pgid= -p "$p" 2>/dev/null | tr -d ' ')" = "$pgid" ] && return 0
    done
  fi
  return 1
}

# Stop a process group only when owned says it is ours. Usage: stop_group <pidfile> <dir> <label> [<port>]
stop_group() {
  local pidfile=$1 dir=$2 name=$3 port=${4:-} pgid
  [ -s "$pidfile" ] || { echo "$name not started by these scripts"; return 0; }
  pgid=$(sed -n 1p "$pidfile")
  if ! kill -0 "-$pgid" 2>/dev/null; then
    echo "$name not running"
  elif ! owned "$pidfile" "$dir" "$port"; then
    echo "$name process group $pgid is not ours any more (stale pid file); left it alone"
  else
    kill -TERM "-$pgid"
    for _ in $(seq 1 15); do
      kill -0 "-$pgid" 2>/dev/null || break
      sleep 1
    done
    kill -0 "-$pgid" 2>/dev/null && kill -KILL "-$pgid" 2>/dev/null
    echo "$name stopped"
  fi
  : >"$pidfile"
}

# A value from <checkout>/.env, without reading any other line into the environment.
env_value() { [ -f "$1/.env" ] && sed -n "s/^$2=\(.*\)/\1/p" "$1/.env" | tail -1 || true; }

# A port recorded in <checkout>/.nimblebrain-worktree/onboarding.json (api, web, showcase, glass).
state_port() {
  local f="$1/.nimblebrain-worktree/onboarding.json"
  [ -f "$f" ] && command -v bun >/dev/null 2>&1 || return 0
  STATE=$f K=$2 bun -e 'const s = await Bun.file(process.env.STATE).json().catch(() => ({})); console.log(s.ports?.[process.env.K] ?? "")'
}

# Copy a file under <checkout>/.nimblebrain-worktree/backups/ once, before our first edit of it.
# That folder is gitignored, and the copies are readable only by you.
backup_once() {
  local dir=$1 file=$2 name dest
  [ -f "$file" ] || return 0
  name=$(printf '%s' "${file#"$dir"/}" | tr '/' '_')
  name=${name#.}
  dest="$dir/.nimblebrain-worktree/backups"
  ls "$dest/$name".*.bak >/dev/null 2>&1 && return 0
  (umask 077 && mkdir -p "$dest" && cp "$file" "$dest/$name.$(date +%Y%m%d%H%M%S).bak")
}

# A feature's value in Codex's config.toml, read from the file itself: "true", "false", or nothing
# when it is not set. Reads both a [features] table and a top-level features.<name> key.
codex_feature() {
  local cfg=${CODEX_HOME:-$HOME/.codex}/config.toml
  [ -f "$cfg" ] || return 0
  awk -v k="$1" '
    /^[[:space:]]*\[/ { t = $0; gsub(/[[:space:]]/, "", t); sub(/\].*/, "]", t); next }
    {
      line = $0; sub(/#.*/, "", line)
      if (split(line, a, "=") < 2) next
      key = a[1]; v = a[2]; gsub(/[[:space:]"]/, "", key); gsub(/[[:space:]]/, "", v)
      if ((t == "[features]" && key == k) || (t == "" && key == "features." k)) print v
    }' "$cfg" | tail -1
}

# Restore absence of a feature setup introduced. Preserve the file's other bytes and values.
# Unsupported TOML shapes are left alone, with custody retained for a later uninstall.
clear_codex_feature() {
  CFG=$1 FEATURE=$2 bun --no-env-file -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { isDeepStrictEqual } from "node:util";
    const { CFG, FEATURE } = process.env;
    const before = readFileSync(CFG, "utf8");
    const expected = Bun.TOML.parse(before);
    if (expected.features?.[FEATURE] !== true) process.exit(0);
    delete expected.features[FEATURE];
    let table = "";
    const after = before.split(/(?<=\n)/).filter((line) => {
      const header = line.match(/^\s*\[([^\]]+)\]/);
      if (header) table = header[1].trim();
      const key = line.match(/^\s*([^=]+?)\s*=\s*true\s*(?:#.*)?(?:\n|$)$/)?.[1].replaceAll("\"", "").trim();
      return !((table === "features" && key === FEATURE) || (!table && key === `features.${FEATURE}`));
    }).join("");
    const actual = Bun.TOML.parse(after);
    actual.features ??= {};
    if (!isDeepStrictEqual(actual, expected)) {
      console.error("Feature uses an unsupported TOML shape; left config unchanged."); process.exit(1);
    }
    if (readFileSync(CFG, "utf8") !== before) process.exit(1);
    writeFileSync(CFG, after);
  '
}

# Whether the agent already has a plugin marketplace named nimblebrain, and from where. Reads the
# agent's own JSON listing on stdin. Prints "absent", "same", or "other <source>".
# Usage: <agent> plugin marketplace list --json | marketplace_source <claude|codex> <repo or path>
marketplace_source() {
  AGENT=$1 WANT=$2 bun -e '
    import { realpathSync } from "node:fs";
    const raw = await Bun.stdin.json().catch(() => null);
    const list = Array.isArray(raw) ? raw : (raw?.marketplaces ?? []);
    const m = list.find((x) => x.name === "nimblebrain");
    if (!m) { console.log("absent"); process.exit(0); }
    const s = m.marketplaceSource ?? {};
    const have = m.repo ?? m.url ?? m.path ?? s.source ?? m.root ?? "";
    const norm = (v) => {
      let u = String(v).trim().replace(/#.*$/, "").replace(/\/+$/, "").replace(/\.git$/, "");
      try { if (u.startsWith("/")) u = realpathSync(u); } catch {}
      return u.replace(/^(https?:\/\/|git@)github\.com[\/:]/, "").toLowerCase();
    };
    console.log(norm(have) === norm(process.env.WANT) ? "same" : `other ${have}`);
  '
}
