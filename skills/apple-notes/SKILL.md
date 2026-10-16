---
name: apple-notes
description: Maintain or disable the Apple Notes theme and layout for BB.
---

# Apple Notes layout

The `apple-notes` plugin reshapes native BB controls using app.css and an SDK
app overlay in app.tsx. Its bundled theme is `plugin:apple-notes:notes`.
Read README.md in the plugin root for development, revert commands, and scope.
Do not replace BB’s list or timeline with a fork: preserve native controls and
plugin contributions. Keep observer/portal cleanup complete and test mobile
search navigation, sidebar collapse, menus, and light/dark after layout edits.
BB can update normally, but its DOM selectors are not a compatibility contract.
After CSS edits, run `python3 scripts/sync-theme.py` then
`bb theme set plugin:apple-notes:notes` as well as build/reload: the generated theme
loads layout before plugins initialize. To revert durably, disable the plugin
and select another theme (or run `bb theme reset`).

The plugin registers Toggle light / dark mode with Cmd/Ctrl+Shift+L, rebindable
in Settings → Keyboard. It updates BB's per-client `bb.theme` storage preference
and notifies the native storage subscriber; verify both directions and refresh
persistence if this native preference contract changes.
