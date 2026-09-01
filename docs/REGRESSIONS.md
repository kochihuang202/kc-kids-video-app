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

## REG-004 — D1 Row Reads spike from playback polling

- Problem: The project consumed tens of millions of D1 Row Reads in one day even though it had only one child and a few hundred videos.
- Reproduction: Leave a watch page open, then inspect D1 Insights. The video/category/settings queries repeat far more often than their 15-second poll interval, every access-state call scans today's heartbeat history, the video-to-category lookup scans all mappings, and authenticated requests repeatedly write `child_devices.last_used_at`.
- Correct behavior: Loading a video happens once; access polling reads one indexed daily rollup row; a heartbeat updates that rollup idempotently while preserving learning/leisure overlap rules; video-first category lookup uses its covering index; device activity is written at most once per 15 minutes.
- Root cause: A React effect used a freshly replaced video object as a dependency and recursively reloaded the route. Independently, the server rebuilt the whole day's usage on every poll, lacked a reverse `category_videos` index, and touched the device row on every request.
- Regression tests: `e2e/regressions/playback-position-stability.spec.ts`, `test/d1-cost-regressions.spec.ts`, and the overlapping-rollup flow in `test/learning-leisure.spec.ts`
