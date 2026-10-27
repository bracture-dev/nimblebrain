// The app's pages as ui:// resources. One HTML file (ui/index.html) serves every page; the page id
// goes into a meta tag the script reads. The stylesheet, the script and NimbleBrain's Synapse SDK
// are inlined, because the host loads the page into a sandboxed frame as one document.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The MCP Apps MIME type: it tells the host this resource is a whole app page. */
export const MCP_APP_MIME = "text/html;profile=mcp-app";

/** app: every panel with tabs. tour and table: one panel each, for a chat answer or a main-area page. */
export const PAGES = ["app", "tour", "table"] as const;
export type Page = (typeof PAGES)[number];

/** A path after the authority: NimbleBrain needs one to place a page. */
export const pageUri = (page: Page) => `ui://showcase/${page}`;

const UI_DIR = join(import.meta.dir, "..", "ui");
const SYNAPSE_IIFE = Bun.resolveSync("@nimblebrain/synapse/iife", import.meta.dir);

/** Escape a script body so it cannot end its own <script> element early. */
const inlineScript = (code: string) =>
  `<script>${code.replaceAll("</script", "<\\/script")}</script>`;

/**
 * Read the page sources from disk. Called on every resources/read, so an edited page shows on the
 * next frame reload without a server restart.
 */
export function renderPage(page: Page): string {
  const html = readFileSync(join(UI_DIR, "index.html"), "utf8");
  const css = readFileSync(join(UI_DIR, "style.css"), "utf8");
  const app = readFileSync(join(UI_DIR, "app.js"), "utf8");
  const synapse = readFileSync(SYNAPSE_IIFE, "utf8");
  // Function replacers: a string replacement would read "$'" and "$&" inside the scripts as patterns.
  return html
    .replace("<!-- page -->", () => `<meta name="showcase-page" content="${page}">`)
    .replace("<!-- style -->", () => `<style>${css}</style>`)
    .replace("<!-- scripts -->", () => inlineScript(synapse) + inlineScript(app));
}
