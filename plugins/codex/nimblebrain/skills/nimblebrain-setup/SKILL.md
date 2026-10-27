---
name: nimblebrain-setup
description: Set up NimbleBrain locally in one pass (fast path), with its showcase and GlassEngine apps running and connected and Codex joined to GlassEngine. Safe to run again on an existing install. Use when someone asks to set up, install, run, try or get started with NimbleBrain locally.
---

# NimbleBrain local setup (Codex)

The steps live once, in the `nimblebrain-setup` skill of the NimbleBrain repository. Codex installs
plugins without symbolic links, so this plugin points to that skill instead of carrying a copy.

1. Run `codex plugin marketplace list --json` and take `root` of the `nimblebrain` marketplace.
   Call it `ROOT`.
2. Read `ROOT/.agents/skills/nimblebrain-setup/SKILL.md` and follow its **Fast path** section, with
   `--agent codex`. Its scripts are in `ROOT/.agents/skills/nimblebrain-setup/scripts`.
3. If that file is missing, read
   `https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/.agents/skills/nimblebrain-setup/SKILL.md`.

This plugin gives Codex the showcase and GlassEngine tools. When this session started before the
plugin was installed, they load in the next session: say so, and tell the person to run
`codex resume --last`.
