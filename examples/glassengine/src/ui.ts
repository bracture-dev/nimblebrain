import { readFileSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = join(import.meta.dir, "..", "ui");

/**
 * Bundle `ui/app.ts` and inline it, with the stylesheet, into one HTML document:
 * an MCP App view is a single resource the host renders in a sandboxed frame.
 * Built once, on first read, so `bun run start` needs no separate build step.
 */
export function uiHtmlBuilder(): () => Promise<string> {
  let html: Promise<string> | undefined;
  return () => {
    html ??= build();
    return html;
  };
}

async function build(): Promise<string> {
  const out = await Bun.build({
    entrypoints: [join(UI_DIR, "app.ts")],
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!out.success) throw new Error(`GlassEngine UI build failed:\n${out.logs.join("\n")}`);
  const script = (await out.outputs[0]?.text()) ?? "";
  const css = readFileSync(join(UI_DIR, "style.css"), "utf8");
  // A literal "</script" inside the bundle would end the inline script early.
  const safe = script.replaceAll("</script", "<\\/script");
  return readFileSync(join(UI_DIR, "index.html"), "utf8")
    .replace("/*STYLE*/", () => css)
    .replace("/*SCRIPT*/", () => safe);
}
