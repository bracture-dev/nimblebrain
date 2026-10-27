---
name: nimblebrain-setup
description: Install and run NimbleBrain locally from source, start its two bundled example apps (the showcase and GlassEngine), connect Codex to them, and hand the rest of setup to Codex working visibly through the showcase. Use when someone asks to set up, install, run, try or get started with NimbleBrain locally. Experimental on Codex.
---

# NimbleBrain local setup (Codex)

The setup steps live in one place, the `nimblebrain-setup` skill in the NimbleBrain repository.
Codex installs plugins without symbolic links, so this plugin carries this pointer instead of a
second copy.

1. Run `codex plugin marketplace list` and take the root of the `nimblebrain` marketplace. Codex
   keeps a copy of the repository there.
2. Read `<root>/.agents/skills/nimblebrain-setup/SKILL.md` and follow it, with its `references/`
   and `scripts/` beside it. Where it says `SCRIPTS`, use `<root>/.agents/skills/nimblebrain-setup/scripts`
   until the clone exists.
3. If that file is missing, read the same path from
   `https://github.com/NimbleBrainInc/nimblebrain` instead.

This plugin already connects Codex to the showcase (`http://127.0.0.1:27280/mcp`) and GlassEngine
(`http://127.0.0.1:27281/mcp`). Skip the setup skill's `codex mcp add glassengine` step. The
workspace connection still needs its own step, described in the skill's "Codex" part.
