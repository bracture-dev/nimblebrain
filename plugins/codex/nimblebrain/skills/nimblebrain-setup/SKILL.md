---
name: nimblebrain-setup
description: Install and run NimbleBrain locally from source, start its two example apps (the showcase and GlassEngine), connect Codex to them, and let Codex finish setup on screen through the showcase. Use when someone asks to set up, install, run, try or get started with NimbleBrain locally. Experimental on Codex.
---

# NimbleBrain local setup (Codex)

The setup steps live in one place: the `nimblebrain-setup` skill in the NimbleBrain repository.
Codex installs plugins without symbolic links, so this plugin points to that skill instead of
carrying a second copy.

1. Run `codex plugin marketplace list` and note the root of the `nimblebrain` marketplace. Codex
   keeps a copy of the repository there.
2. Read `<root>/.agents/skills/nimblebrain-setup/SKILL.md` and follow it. Its `references/` and
   `scripts/` folders sit beside it. Until the clone exists, read `SCRIPTS` in that skill as
   `<root>/.agents/skills/nimblebrain-setup/scripts`.
3. If that file is missing, read the same path from
   `https://github.com/NimbleBrainInc/nimblebrain` instead.

This plugin already connects Codex to the showcase (`http://127.0.0.1:27280/mcp`) and GlassEngine
(`http://127.0.0.1:27281/mcp`). In the Codex part of the skill's step 10, add only the workspace
connection.
