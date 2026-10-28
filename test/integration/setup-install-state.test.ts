import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve(import.meta.dir, "../../.agents/skills/nimblebrain-setup/scripts");
const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

interface InstallState {
  installedCommit?: string;
  agents: Record<string, boolean>;
  added: string[];
}

function fixture(agent = "claude") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "nb-setup-state-")));
  fixtures.push(root);
  const dir = join(root, "checkout");
  const scripts = join(dir, ".agents/skills/nimblebrain-setup/scripts");
  const bin = join(root, "bin");
  const statePath = join(dir, ".nimblebrain-worktree/onboarding.json");
  const packageJson = JSON.stringify({ packageManager: "bun@1.4.4" });
  for (const path of [
    scripts,
    bin,
    join(root, "home/.codex"),
    join(dir, ".git"),
    join(dir, ".nimblebrain-worktree"),
  ]) {
    mkdirSync(path, { recursive: true });
  }
  for (const name of ["setup.sh", "install.sh", "lib.sh"]) {
    copyFileSync(join(source, name), join(scripts, name));
  }
  for (const path of [dir, join(dir, "web"), join(dir, "src/platform/example/ui")]) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "package.json"), packageJson);
  }
  const shell = (path: string, body: string) => {
    writeFileSync(path, `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 });
  };
  // The real setup/install/state code runs; network, packages, services and agent CLIs are fake.
  for (const name of ["check.sh", "examples.sh", "start.sh", "verify.sh"]) {
    shell(join(scripts, name), "exit 0");
  }
  shell(join(scripts, "connect.sh"), 'echo "[connect] added connector:showcase"');
  writeFileSync(join(root, "head"), "commit-one\n");
  shell(
    join(bin, "git"),
    `[ "$1" != --version ] || { echo 'git fixture'; exit 0; }
[ "$1" != -C ] || shift 2
case "$*" in
  'remote get-url origin') echo https://github.com/fixture/repo.git ;;
  'status --porcelain --untracked-files=no') ;;
  'symbolic-ref -q HEAD') echo refs/heads/main ;;
  'rev-parse HEAD'|'rev-parse --short HEAD') cat "$NB_TEST_ROOT/head" ;;
  'pull --quiet --ff-only')
    if [ -f "$NB_TEST_ROOT/next-head" ]; then cp "$NB_TEST_ROOT/next-head" "$NB_TEST_ROOT/head"; fi ;;
  *) echo "unexpected git: $*" >&2; exit 90 ;;
esac`,
  );
  shell(
    join(bin, "bun"),
    String.raw`case "$1" in
  --version) echo 1.4.4 ;;
  -e) exec "$NB_TEST_BUN" --no-env-file "$@" ;;
  install|run)
    printf '%s %s\n' "$PWD" "$*" >> "$NB_TEST_ROOT/packages"
    if [ "$1" = install ]; then
      [ "$*" = 'install --frozen-lockfile --ignore-scripts' ] || exit 91
      mkdir -p node_modules
      [ "$NB_TEST_FAIL" != web ] || [ "$PWD" != "$NB_TEST_DIR/web" ] || exit 41
    else
      [ "$*" = 'run build' ] || exit 92
      [ "$NB_TEST_FAIL" != build ] || exit 42
      mkdir -p dist
      echo built > dist/index.html
    fi ;;
  *) echo "unexpected bun: $*" >&2; exit 93 ;;
esac`,
  );
  shell(join(bin, "node"), "exit 0");
  shell(
    join(bin, "curl"),
    `[ "$*" = '-fsS http://127.0.0.1:27271/v1/bootstrap' ] || exit 94
echo '{"workspaces":[{"id":"ws_fixture"}]}'`,
  );
  const nativeAgent = String.raw`agent=$(basename "$0")
case "$1 $2" in
  'plugin list') echo nimblebrain@nimblebrain ;;
  'features enable')
    [ "$NB_TEST_FAIL" != feature ] || exit 51
    printf '[features]\nmcp_2026_07_28 = true\n' > "$HOME/.codex/config.toml" ;;
  'mcp get')
    [ "$3" = nimblebrain ] && [ -f "$NB_TEST_ROOT/$agent-door" ] || exit 1
    door=$(cat "$NB_TEST_ROOT/$agent-door")
    if [ "$agent" = claude ]; then echo "URL: $door";
    else printf '{"transport":{"url":"%s"}}\n' "$door"; fi ;;
  'mcp add')
    [ "$NB_TEST_FAIL" != mcp ] || exit 52
    for door in "$@"; do :; done
    printf '%s\n' "$door" > "$NB_TEST_ROOT/$agent-door" ;;
  *) echo "unexpected agent: $*" >&2; exit 95 ;;
esac`;
  shell(join(bin, "claude"), nativeAgent);
  shell(join(bin, "codex"), nativeAgent);
  return {
    dir,
    home: join(root, "home"),
    state: () => JSON.parse(readFileSync(statePath, "utf8")) as InstallState,
    packages: () => readFileSync(join(root, "packages"), "utf8"),
    removeDependencies: () => rmSync(join(dir, "node_modules"), { recursive: true, force: true }),
    advance: () => writeFileSync(join(root, "next-head"), "commit-two\n"),
    seed: (state: InstallState) => writeFileSync(statePath, JSON.stringify(state)),
    run(fail = "", update = false) {
      const result = spawnSync(
        "bash",
        [
          join(scripts, "setup.sh"),
          "--agent",
          agent,
          "--dir",
          dir,
          "--repo",
          "fixture/repo",
          ...(update ? ["--update"] : []),
        ],
        {
          cwd: root,
          // Do not inherit credentials, native config paths, or the checkout's .env.
          env: {
            PATH: `${bin}:/usr/bin:/bin`,
            HOME: join(root, "home"),
            NB_TEST_ROOT: root,
            NB_TEST_DIR: dir,
            NB_TEST_BUN: process.execPath,
            NB_TEST_FAIL: fail,
          },
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      if (result.error) throw result.error;
      return { status: result.status, output: result.stdout + result.stderr };
    },
  };
}

test("setup leaves an unavailable Desktop shortcut alone", () => {
  const setup = fixture();
  const desktop = join(setup.home, "Desktop");
  mkdirSync(desktop);
  // A FIFO models a file whose read never completes, without relying on a cloud provider.
  const shortcut = join(desktop, "NimbleBrain.webloc");
  expect(spawnSync("mkfifo", [shortcut]).status).toBe(0);
  expect(setup.run().status).toBe(0);
  expect(existsSync(shortcut)).toBe(true);
  expect(setup.state().added.some((entry) => entry.startsWith("desktop:"))).toBe(false);
});

for (const option of ["--showcase-port", "--glass-port"]) {
  test(`preflight refuses unsupported native plugin ports via ${option}`, () => {
    const setup = fixture();
    const result = spawnSync(
      "bash",
      [join(source, "check.sh"), "--dir", setup.dir, option, "29000"],
      {
        env: { HOME: setup.home, PATH: "/usr/bin:/bin" },
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("Showcase 27280 and GlassEngine 27281");
    expect(result.stdout).not.toContain("not installed");
    expect(existsSync(join(setup.dir, ".nimblebrain-worktree/onboarding.json"))).toBe(false);
  });
}

test("native configuration failure retains prior successful agents and additions", () => {
  const setup = fixture("codex");
  const prior = {
    installedCommit: "commit-old",
    agents: { claude: true, codex: true },
    added: ["claude-mcp:nimblebrain", "codex-marketplace"],
  };
  setup.seed(prior);
  expect(setup.run("mcp").status).toBe(52);
  expect(setup.state().agents).toEqual(prior.agents);
  expect(setup.state().added).toEqual(expect.arrayContaining(prior.added));
  expect(setup.state().added).toContain("codex-feature:mcp_2026_07_28");
  expect(setup.state().added).not.toContain("codex-mcp:nimblebrain");
});

for (const failure of ["web", "build"]) {
  test(`setup retries an initial failed ${failure} step despite root node_modules`, () => {
    const setup = fixture();
    expect(setup.run(failure).status).toBe(failure === "web" ? 41 : 42);
    expect(existsSync(join(setup.dir, "node_modules"))).toBe(true);
    expect(setup.state().installedCommit).toBeUndefined();
    expect(setup.state().agents).toEqual({});
    const failedPackages = setup.packages();

    expect(setup.run().status).toBe(0);
    expect(setup.packages().length).toBeGreaterThan(failedPackages.length);
    expect(existsSync(join(setup.dir, "src/platform/example/ui/dist/index.html"))).toBe(true);
    expect(setup.state().installedCommit).toBe("commit-one");
    expect(setup.state().agents).toEqual({ claude: true });
    const successfulPackages = setup.packages();
    expect(setup.run().status).toBe(0);
    expect(setup.packages()).toBe(successfulPackages);
  });
}

test("a failed update preserves the last successful commit and ownership until retry succeeds", () => {
  const setup = fixture();
  expect(setup.run().status).toBe(0);
  const prior = setup.state();
  prior.agents.codex = true;
  prior.added.push("codex-mcp:nimblebrain");
  setup.seed(prior);
  setup.advance();

  expect(setup.run("build", true).status).toBe(42);
  expect(setup.state().installedCommit).toBe("commit-one");
  expect(setup.state().agents).toEqual(prior.agents);
  expect(setup.state().added).toEqual(prior.added);
  const failedPackages = setup.packages();
  expect(setup.run().status).toBe(0);
  expect(setup.packages().length).toBeGreaterThan(failedPackages.length);
  expect(setup.state().installedCommit).toBe("commit-two");
  expect(setup.state().agents).toEqual(prior.agents);
  expect(setup.state().added).toEqual(prior.added);
});

test("setup retries an interrupted reinstall of the previously successful commit", () => {
  const setup = fixture();
  expect(setup.run().status).toBe(0);
  const prior = setup.state();
  setup.removeDependencies();

  expect(setup.run("build").status).toBe(42);
  expect(existsSync(join(setup.dir, "node_modules"))).toBe(true);
  expect(setup.state().installedCommit).toBe(prior.installedCommit);
  expect(setup.state().agents).toEqual(prior.agents);
  expect(setup.state().added).toEqual(prior.added);
  const failedPackages = setup.packages();
  expect(setup.run().status).toBe(0);
  expect(setup.packages().length).toBeGreaterThan(failedPackages.length);
  const successfulPackages = setup.packages();
  expect(setup.run().status).toBe(0);
  expect(setup.packages()).toBe(successfulPackages);
});

for (const [agent, failure, status] of [
  ["claude", "mcp", 52],
  ["codex", "mcp", 52],
  ["codex", "feature", 51],
] as const) {
  test(`${agent} is recorded only after native ${failure} configuration succeeds`, () => {
    const setup = fixture(agent);
    expect(setup.run(failure).status).toBe(status);
    expect(setup.state().installedCommit).toBe("commit-one");
    expect(setup.state().agents).toEqual({});
    expect(setup.state().added).not.toContain(`${agent}-mcp:nimblebrain`);
    if (agent === "codex" && failure === "mcp") {
      expect(setup.state().added).toContain("codex-feature:mcp_2026_07_28");
    }
    const installedPackages = setup.packages();
    expect(setup.run().status).toBe(0);
    expect(setup.packages()).toBe(installedPackages);
    expect(setup.state().agents).toEqual({ [agent]: true });
    expect(setup.state().added).toContain(`${agent}-mcp:nimblebrain`);
  });
}
