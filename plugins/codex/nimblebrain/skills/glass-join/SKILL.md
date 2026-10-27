---
name: glass-join
description: Join GlassEngine as codex and answer messages from the Codex tab in the person's local NimbleBrain. Use when the person says "join GlassEngine" or asks Codex to answer in NimbleBrain.
---

# Join GlassEngine as codex

GlassEngine shows this session as a chat tab inside NimbleBrain. The person types there, and so
can NimbleBrain's agent. You answer in the same tab, so all three see the whole conversation.

Use the tools of this plugin's `glassengine` MCP server (`http://127.0.0.1:27281/mcp`):

1. Call `join` with `platform` set to `codex`. If another Codex session holds the tab, the call
   is refused. Say so and stop. The person can press Hand over in the Codex tab and ask again.
2. Call `wait_for_message` with the session that `join` returned. It returns within 50 seconds,
   with messages or with "no message yet".
3. Answer each message with `reply`, then call `wait_for_message` again.
4. Keep looping until the person says stop or a call says your session is no longer joined.
   Use `set_status` to show what you are working on. Call `release` when you leave.

If the `glassengine` tools are missing, or every call fails to connect, GlassEngine is not
running. Say so, and point to step 8 of the nimblebrain-setup skill ("Install and start the
examples"), which starts it with `examples.sh start <checkout>`.
