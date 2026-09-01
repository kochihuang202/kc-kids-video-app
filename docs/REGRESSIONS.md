# Regression Memory

Only important bugs that have occurred in the real app belong here.

## REG-001 — Playback time jumps back while a video is playing

- Problem: A local video played normally, but its timeline periodically jumped backward to the saved resume position.
- Reproduction: Open a previously watched local video, start playback, keep it playing across the 15-second access-state refresh, and observe the displayed and native playback positions.
- Correct behavior: Playback time must remain monotonic while playing. Refreshing access limits must not reload the video or reapply the resume position.
- Root cause: The access polling effect depended on the freshly loaded `video` object and called the full video loader again. Each load replaced the object and reapplied `lastPositionSeconds`, creating a reload/reset loop.
- Regression test: `e2e/regressions/playback-position-stability.spec.ts`

## REG-002 — Local Mac/Tailscale media sometimes fails on the first connection

- Problem: A local video occasionally showed “目前連不到家裡的影片”, but repeatedly pressing “再試一次” eventually connected.
- Reproduction: Open an authorized local-media watch page while the first media requests fail transiently, without reloading the whole app.
- Correct behavior: The player automatically reloads the media source every four seconds for at most 60 seconds, stops immediately after a successful load, and only then leaves the manual retry option.
- Root cause: Native media errors were terminal in the UI; recovery required a full-page manual reload even when the Mac/Tailscale path became reachable moments later.
- Regression test: `e2e/regressions/media-auto-retry.spec.ts`

## REG-003 — Parent route repeatedly appends `/rules`

- Problem: Opening the management center could produce a URL such as `/parent/today/rules/rules/rules/...` and leave the page unusable.
- Reproduction: Enter a malformed legacy nested parent route and let the authenticated parent router apply its fallback.
- Correct behavior: The fallback uses one absolute destination. Since the Today/history page was explicitly restored, malformed parent routes now redirect exactly once to `/parent/today`.
- Root cause: A relative fallback navigation appended `rules` to the current nested URL each time the fallback rendered.
- Regression test: `test/parent-routing.ui.tsx`
