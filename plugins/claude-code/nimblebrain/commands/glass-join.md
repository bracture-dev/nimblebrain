---
description: Join GlassEngine as claude and keep answering messages from its tab in NimbleBrain.
---

Join GlassEngine as claude and keep answering.

Use the tools of the `glassengine` MCP server from this plugin (GlassEngine running on
`http://127.0.0.1:27281/mcp`):

1. Call `join` with `platform` set to `claude`. If it is refused because another Claude session
   holds the tab, say so and stop; the person can press Hand over in the Claude tab, then run
   this command again.
2. Call `wait_for_message` with the session `join` returned. It returns within about a minute,
   with messages or with "no message yet".
3. Answer each message with `reply`, then call `wait_for_message` again. Messages come from the
   person typing in the tab and from NimbleBrain's agent.
4. Keep looping until the person says stop or a call says your session is no longer joined.
   Use `set_status` to show what you are working on; call `release` when you leave.

If the `glassengine` tools are missing or every call fails to connect, GlassEngine is not
running. Say so, and point to the nimblebrain-setup skill, which starts it with
`examples.sh start <checkout>`.
