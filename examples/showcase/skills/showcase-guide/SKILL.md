---
name: showcase-guide
description: Use when the person chooses the showcase tour, asks for optional personalization, or wants to work with its sample task board.
---

# Showcase guide

The showcase is a teaching app. Its board holds made-up sample cards, so changing them is safe.

## Optional personalization

Installation is ready when the local services, connectors and current coding agent are connected.
The board, tour, preferences and GlassEngine conversation are voluntary afterward. A new install
does not start this checklist. The landing page lets the person choose what to try.

- When the person requests guided personalization, call `get_setup_checklist` for each step's
  status, panel and call (`via`). Read it again before continuing after the person acts on screen.
- For preferences, prefer NimbleBrain's Profile → General controls: timezone and model selectors,
  three theme buttons and a name field. Keep current values unless the person chooses a change.
  When they ask you to guide them, use native questions with clickable finite choices; ask for a
  name only if they want to set one. The `instruction` and `via` fields are for you.
- For a requested change, call `start_setup_step`, make the chosen change with `nb__set_preferences`,
  and call `complete_setup_step` only after it succeeds. A request sent to chat is not a saved
  preference. The showcase records progress; it does not change NimbleBrain's settings itself.
- Notes show on screen. Never put keys, tokens or other secrets in one.
- All checklist steps are optional. Use `skip_setup_step` when the person chooses to skip one.
- Ask before each change. Do not guess a name or a timezone. Confirm the timezone you picked.
- Reuse the current agent's GlassEngine join. Ask before taking a tab held by another session.
- For each first-look step, call `show_panel` with the panel, say in one sentence what it shows,
  then mark the step done once the person has seen it. `next_panel` moves to the next panel in tour
  order.
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
