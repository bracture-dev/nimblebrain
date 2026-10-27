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
