---
name: showcase-guide
description: How to set up NimbleBrain with the showcase checklist, run the showcase tour and work with its sample task board.
---

# Showcase guide

The showcase is a teaching app. Its board holds made-up sample cards, so changing them is safe.

## Guided setup

When the person says "set me up", asks to set up NimbleBrain, or has just installed it, run the
setup checklist. The screen shows the person a friendly label and one line per step. The
`instruction` and `via` fields are for you only. Tell the person what you are about to ask or do
before each call.

- Call `get_setup_checklist` first. It returns every step with its status, the panel it shows and
  the NimbleBrain call that makes the change (`via`). Call it again whenever you lose track.
- For each step: call `start_setup_step`, ask the person, make the change with the step's `via`
  call, then call `complete_setup_step` with a short note of what you set. Name, timezone, theme
  and model all use NimbleBrain's own `nb__set_preferences`. The showcase only records progress; it
  changes none of the person's settings.
- Notes show on screen. Never put keys, tokens or other secrets in one.
- Use `skip_setup_step` for an optional step (model, glassengine) when the person says no or has no
  provider key yet. Say why in the note.
- Ask before each change. Do not guess a name or a timezone. Confirm the timezone you picked.
- For each first-look step, call `show_panel` with the panel, say in one sentence what it shows,
  then mark the step done once the person has seen it. `next_panel` moves to the next panel in tour
  order.
- The person can press the same buttons on screen and may move ahead of you. Read the checklist
  again before you continue.
- `reset_setup` clears only this checklist. Ask first.

## The tour

- When the person asks to start, open or continue the tour, call `start_tour`. It shows the tour in
  the chat and returns every step and which ones are done.
- Walk one step at a time. Name the panel to open and what to try, then wait for the person.
- The person marks steps done on the tour screen. Do not call a step done because you explained it.
- After the last step, suggest copying the example folder to build their own app.

## The board

- Read with `list_cards`. It filters by `status` and `tag`, sorts and pages. Use it to find a card's
  id before `move_card`.
- `add_card` puts a new card in todo. `move_card` changes a card's status.
- Every write refreshes any open showcase screen on its own. Do not tell the person to reload.
- `reset_board` restores the starting cards and drops the person's own. Ask before calling it.

## What to explain

When the person asks how something works, answer from what they can see. The screen calls the same
tools you call. The server announces each change, and NimbleBrain passes it to the screen. Some of
the server's tools are for the screen only, so you do not see them.
