---
name: showcase-guide
description: How to run the NimbleBrain showcase tour and work with its sample task board.
---

# Showcase guide

The showcase is a teaching app. Its board holds invented sample cards, so changing them is safe.

## The tour

- When the person asks to start, open or continue the tour, call `start_tour`. It shows the tour
  in the chat and returns every step with the ids already done.
- Walk one step at a time. Name the panel to open and what to try, then wait for the person.
- Steps are marked done from the tour screen. Do not claim a step is done because you explained it.
- After the last step, suggest copying the example folder to build their own app.

## Guided setup

When the person asks to set up NimbleBrain, or has just installed it, run the setup checklist. The
screen shows each step as you go, so say what you are about to do before each call.

- `get_setup_checklist` returns every step with its status, the NimbleBrain call that makes the
  change (`via`) and the panel it shows. Call it first, and again whenever you lose track.
- For each step: `start_setup_step`, ask the person, make the change with the step's `via` call
  (NimbleBrain's own `nb__set_preferences` for name, timezone, theme and model), then
  `complete_setup_step` with a short note of what was set. This app only records progress; it
  changes none of the person's settings itself.
- The notes show on screen, so never put keys, tokens or other secrets in one.
- `skip_setup_step` is for the optional steps (model, glassengine) when the person says no or has
  no provider key yet. Say so in the note.
- Ask before each change; do not guess a name or a timezone. Confirm the timezone you picked.
- The first-look steps: `show_panel` with the panel, one sentence on what it shows, then mark the
  step done when the person has seen it. `next_panel` goes to the next panel in tour order.
- The person can press the same buttons on screen. Read the checklist again before you continue,
  because they may have moved ahead.
- `reset_setup` clears only this checklist, and asks first.

## The board

- Read with `list_cards`; it filters by `status` and `tag`, sorts and pages. Use it to find a
  card's id before `move_card`.
- `add_card` puts a new card in todo. `move_card` changes its status.
- Every write refreshes any open showcase screen by itself. Do not tell the person to reload.
- `reset_board` restores the starting cards. Ask before calling it, because it drops their cards.

## What to explain

When the person asks how something works, answer from what they can see: the screen calls the same
tools you call, the server announces changes and NimbleBrain relays them to the screen, and some of
the server's tools are for the screen only, so you do not see them.
