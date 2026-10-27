// Skills over the MCP skills extension. Each folder in skills/ holds one SKILL.md. The server lists
// them with skills/list (frontmatter, digest and size) and serves each file with resources/read.
// NimbleBrain checks the fetched file against the listing before it uses a skill.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";

export interface Skill {
  uri: string;
  text: string;
  frontmatter: Record<string, string>;
}

/**
 * Read the frontmatter block of a SKILL.md. Only plain `key: value` lines are accepted, so the
 * result equals what a YAML parser reads from the same text. Anything fancier throws, rather than
 * produce a listing the host would refuse.
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error("SKILL.md must start with a --- frontmatter block.");
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const pair = /^([a-z][a-z0-9-]*): (.+)$/.exec(line);
    const value = pair?.[2]?.trim();
    if (!pair?.[1] || !value || /^["'[{>|&*!%@`]/.test(value) || / #|: /.test(value)) {
      throw new Error(`Frontmatter line must be a plain "key: value": ${line}`);
    }
    fields[pair[1]] = value;
  }
  return fields;
}

export function loadSkills(root: string): Skill[] {
  const folders = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return folders.map(({ name }) => {
    const text = readFileSync(join(root, name, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(text);
    if (frontmatter.name !== name) {
      throw new Error(`skills/${name}/SKILL.md: frontmatter name must equal the folder name.`);
    }
    if (!frontmatter.description) throw new Error(`skills/${name}/SKILL.md needs a description.`);
    return { uri: `skill://${name}/SKILL.md`, text, frontmatter };
  });
}

/** One skills/list entry. With no tool-affinity in its frontmatter, NimbleBrain binds the skill to every tool of this server. */
export function listEntry(skill: Skill) {
  const bytes = new TextEncoder().encode(skill.text);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  return {
    uri: skill.uri,
    frontmatter: skill.frontmatter,
    resources: [{ uri: skill.uri, digest, size: bytes.byteLength }],
  };
}
