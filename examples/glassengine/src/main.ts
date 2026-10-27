import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { createGlass } from "./glass.ts";
import { serve, UI_URI } from "./server.ts";
import { openStore } from "./store.ts";
import { uiHtmlBuilder } from "./ui.ts";

const root = resolve(import.meta.dir, "..");
const port = Number(process.env.PORT ?? 27281);
const configPath = resolve(
  process.env.GLASSENGINE_CONFIG ??
    (existsSync(join(root, "glassengine.config.json"))
      ? join(root, "glassengine.config.json")
      : join(root, "glassengine.config.example.json")),
);
const dataDir = resolve(process.env.GLASSENGINE_DATA ?? join(root, ".glassengine"));

const config = loadConfig(configPath);
const store = openStore(dataDir);
const token = process.env.GLASSENGINE_TOKEN ?? readOrCreateToken(join(dataDir, "token"));

let changed = () => {};
const glass = createGlass(config, store, { onChange: () => changed() });
const running = serve({ glass, uiHtml: uiHtmlBuilder(), port, token });
changed = running.changed;

const connector = {
  url: running.url,
  serverName: "glassengine",
  transport: { type: "streamable-http", auth: { type: "bearer", token } },
  ui: {
    placements: [
      { slot: "sidebar.apps", resourceUri: UI_URI, route: "glassengine", label: "GlassEngine" },
    ],
  },
};

process.stdout.write(
  [
    `GlassEngine serving MCP at ${running.url}`,
    `  config: ${configPath}`,
    `  data:   ${dataDir}`,
    `  tabs:   ${glass
      .tabs()
      .map((t) => `${t.id} (${t.kind})`)
      .join(", ")}`,
    "",
    "Connect Claude Code (once):",
    `  claude mcp add --transport http --scope user glassengine ${running.url}`,
    "",
    "Connector entry for <workDir>/workspaces/<wsId>/workspace.json (see README, Connect to NimbleBrain):",
    JSON.stringify(connector, null, 2),
    "",
  ].join("\n"),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void running.stop().then(() => process.exit(0));
  });
}

/** A random token kept in the data folder, so the connector entry stays valid across restarts. */
function readOrCreateToken(path: string): string {
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex");
  writeFileSync(path, `${fresh}\n`, { mode: 0o600 });
  return fresh;
}
