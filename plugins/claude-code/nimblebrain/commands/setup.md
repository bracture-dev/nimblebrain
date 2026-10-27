---
description: Set up NimbleBrain on this machine, fast path. Installs NimbleBrain, starts the showcase and GlassEngine, connects them and this session, then joins GlassEngine. One plan, one yes. Safe to run again.
argument-hint: "[changes, e.g. folder ~/nb or ports 27371/27370]"
---

Set up NimbleBrain locally on the fast path: $ARGUMENTS

The steps live once, in the `nimblebrain-setup` skill of the NimbleBrain repository. Find it in the
copy Claude Code keeps of this plugin's marketplace:

1. Run `claude plugin marketplace list --json` and take `installLocation` of the `nimblebrain`
   entry. Call it `ROOT`.
2. Read `ROOT/.agents/skills/nimblebrain-setup/SKILL.md` and follow its **Fast path** section. Its
   scripts are in `ROOT/.agents/skills/nimblebrain-setup/scripts`.
3. If that file is missing, read
   `https://raw.githubusercontent.com/NimbleBrainInc/nimblebrain/main/.agents/skills/nimblebrain-setup/SKILL.md`.

This plugin already gives this session the showcase and GlassEngine tools, so after setup join
GlassEngine as `claude` from here.
