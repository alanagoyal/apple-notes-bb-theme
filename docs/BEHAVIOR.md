# Behavior and verification notes

## Update boundaries

Public SDK hooks supply live thread metadata and navigation. Existing thread-list
controls still own pinning, drag sorting, splits, archive/delete confirmations,
custom row actions and plugin integrations. The renderer and all controls continue
to update with BB. CSS/DOM selectors are not a stable BB API: after a major UI
change, review the presentation and update the small selector layer. It cannot
promise permanent pixel fidelity across every future BB release.

Search matches titles and project names of active, non-hidden threads and displays
up to 60 results. It does not search message bodies. On mobile, a result closes
the native sidebar drawer. Native list grouping and sorting remain unchanged.

Refresh verification uses PerformanceObserver layout-shift entries and per-frame
rectangles for sidebar, loading rows, heading, timeline, and composer. Initial
messages reveal after 120ms of stable geometry, with a 1.5s JS / 2s CSS fail-open.
Streaming and subsequent scrolling are never gated. Heading space is reserved
on the timeline parent so inserting the heading does not alter list geometry.

The chronological sidebar groups unpinned native rows by local calendar day:
Today, Yesterday, Previous 7 Days (2–6 days ago), Previous 30 Days (7–29), and Older.
Empty buckets are omitted. Pinned remains BB's native group. Labels refresh on
list changes and once a minute, including across midnight; original group controls
and thread row actions remain available. Other organization modes keep native
project/section headings.

On mobile, Home presents the already-mounted native sidebar at full viewport width.
It uses the same search portal, native thread list, date headings and controls;
there is no second list renderer. New note reveals BB's existing composer, and
its sidebar toggle returns to the list. The small lifecycle hook restores native
drawer accessibility attributes on navigation, resize and plugin cleanup.

Toggle light/dark with **Cmd+Shift+L** (Ctrl+Shift+L on Windows/Linux), or the
**Apple Notes → Toggle light / dark mode** command in the palette. Rebind it in
Settings → Keyboard. It switches the current client to an explicit light/dark
mode and persists across refresh; select System in Appearance to follow the OS.
The command uses BB's native `bb.theme` storage preference and storage subscriber.

Press `/` outside an input/editor to open and focus sidebar search. It selects
existing search text, works with a collapsed/mobile sidebar, and leaves typing,
modifier shortcuts, terminal/editor input and open modal menus alone.

New thread uses BB's original composer as a full-height blank note with a
centered creation date, the native placeholder, and a gold caret. Project,
environment/machine, model, attachments, voice and permission controls remain
at the bottom. New thread focuses the editor; mobile Enter submits through the
native form (Shift+Enter inserts a newline), deferring to open suggestion menus
and IME composition. Existing thread message/composer styles are unaffected.

New-note routing recognizes explicit project, machine and model phrases in the
current draft, using BB's live catalogs and public composer selection API.
For example, `in my website project on mac mini use 6.1 sol med` updates the
native pickers after a short typing pause. Normal project routing uses the local
checkout's current branch; it does not assume main. `in a new worktree` selects
BB's native worktree option without creating it until send. The draft is unchanged.
Picker changes remain editable, and unchanged routing phrases do not overwrite
manual choices. Ambiguous/unavailable selections show a status with a manual
selection override. Sending waits for pending routing to settle.
Run `node scripts/verify-routing.mjs` for parser regression checks.

File drops anywhere inside a thread pane (or the new-note canvas) forward to
that pane's existing native composer attachment handler. Direct composer drops
keep BB's normal path, and sidebar/text drags are unaffected. A translucent dim covers the active chat pane, including its header and
composer, without shifting layout. Native composer drag outlines are suppressed. Drop listeners and feedback
are removed on plugin cleanup.

Sidebar separators follow actual adjacent row bounds, so pinned and virtualized
wrappers share one rule. Hover, selection, keyboard focus and open row menus hide
the row's bottom line and the preceding adjacent row's line; date/section headings
break adjacency. Recheck first/middle/last pinned and normal rows, hover beside a
selection, menu open/close, collapse/reopen and narrow layouts after list changes.
The observer updates after remounts/reordering, and removes its attributes/listeners
when disabled.

`./scripts/verify-sidebar-separators.browser.js` is a live-plugin regression matrix:
run it with `bb browser-automation run SESSION --script-file ABSOLUTE_PATH
--script-host HOST`. Start from a loaded BB page in keyboard modality (press Tab).
It creates and removes isolated, unsaved fixtures under the app root. Its 476
assertions cover first/middle/last rows in direct, pinned, windowed and mixed
wrappers; selection, own/child menu state, keyboard focus; section boundaries;
reordering, remounting, collapsed rows and stale-state cleanup. It changes no
saved thread or sidebar preferences. Repeat with narrow viewports after changes.

## Review fixes (October 2026)

Heading space follows its measured height, including wrapped titles and fork
metadata. Search results scroll in the sidebar while the search field stays
visible; clear returns focus to search, and results have a keyboard focus state.
The lowercase prose style excludes code, keyboard notation and editable fields.

Focus retries use one cancellable animation frame chain. Detached placeholder
nodes are released during reconciliation. Model request detection shares the
parser's quote/code filtering and accepts integer model versions such as
`use 6 astra med`; negated requests leave selections alone. Enter on a picker
or button retains native keyboard behavior instead of submitting the note.

The native split send button shares the gold submit surface in both color modes.

## Routing errors

Routing feedback occupies normal layout space between the editor controls and
project/machine pickers. Messages wrap; unusually long details scroll inside the
message area while Retry and Use current selections remain visible. The live
region preserves feedback through composer remounts.

Retry reloads catalogs and reattempts failed selections. Failed and partial
catalog requests are not cached as successful results; reads time out after
15 seconds. Stale responses cannot replace feedback for an edited draft. The
manual override applies to the current draft and resets when the draft is cleared.
Submission waits for routing, rejects an edited draft, and coalesces concurrent
send attempts. Model phrases accept both `6 astra` and `astra 6`; explicit
`no project selected` resolves to BB's personal workspace.

Light/dark changes use `theme-color-sync.ts` to settle document-wide palette
transitions before paint, including native controls, plugin UI and pseudo-elements.
Normal hover transitions, loading animations and geometry/opacity transitions remain
enabled. The observer and pending animation frames are disposed on plugin unload.
To regression-check a loaded BB page or menu, run
`bb browser-automation run SESSION --script-file /absolute/path/to/scripts/verify-theme-colors.js --script-host HOST --json`.
This checks first-frame colors, pseudo-elements, rapid mode changes and lingering
palette transitions without injecting a replacement stylesheet.

New-note submission preserves an inert visual snapshot of the submitted canvas
until the destination heading and timeline have passed initial layout readiness,
then fades it out over 180ms (immediate with reduced motion). This covers both
the editor-clearing frame and route-loading gap. Failed routing keeps the real
editor visible. Snapshots have no native IDs, plugin hooks, or accessible controls;
resize, navigation elsewhere, plugin cleanup, and an eight-second fail-open remove
them. Thread readiness survives virtualizer remounts so a visible note never
returns to the initial hidden state.


Desktop new-note autofocus follows the active note surface, including closing
an existing thread with X and loading the blank note directly. It waits until
the initial hidden layout is visible, then stops after focus succeeds. Clicking
or typing cancels pending focus, and an existing search/input focus is preserved.
Mobile retains its existing user-gesture focus behavior. The observer and frame
are removed on plugin cleanup.

To verify, start a browser-automation session on an existing thread and run
`scripts/verify-new-note-focus.browser.js`. It checks repeated X-button closes,
direct blank-note loading, the New thread button, and retaining search focus
both after reveal and when clicked while reveal is pending.
