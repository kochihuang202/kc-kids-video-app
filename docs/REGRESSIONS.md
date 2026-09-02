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

## REG-005 — Long recent-video titles make thumbnail cards wider

- Problem: Cards in the “最近看過” row had visibly different widths; longer titles produced much larger thumbnails.
- Reproduction: Load the child home page with recent videos whose labels range from a short title to “第13季【可愛巧虎島】飛吧！SUPER YA！”.
- Correct behavior: Every recent card remains 150px wide and long labels are truncated with an ellipsis.
- Root cause: The card used a 150px flex basis but retained the flex item default `min-width: auto`. Its no-wrap heading therefore became the min-content width and expanded the entire card.
- Regression test: `e2e/regressions/recent-card-width.spec.ts`

## REG-006 — Learned videos are not visually distinct and have no completion time

- Problem: After marking a video learned, it only moved to the end with a subtle color change, making it difficult to distinguish from videos that were still being learned; the child could not see when it was completed.
- Reproduction: Open a category, mark its first video learned, and compare it with the remaining cards.
- Correct behavior: Unlearned and learned videos appear in separate labeled groups. Learned cards have a strong completion treatment and show the actual `Asia/Taipei` completion date and time; cancelling learned restores the original ordering.
- Root cause: The category page rendered one grid and the child content DTO discarded the existing `video_learned_state.learned_at` value.
- Regression tests: `e2e/features/learning-leisure-flow.spec.ts` and `test/learning-leisure.spec.ts`

## REG-007 — Local-video placeholder shows the wrong course name

- Problem: Opening DeepEng before its R2 thumbnails were generated showed “泉靈的語文課” in the middle of every video card.
- Reproduction: Open the DeepEng category while its self-hosted videos use `/local-media-placeholder.svg`.
- Correct behavior: The placeholder displays the current category name, such as “DeepEng”; it must not contain a course name hard-coded for another category.
- Root cause: The shared static placeholder SVG contained the text “泉靈的語文課”.
- Regression test: `e2e/regressions/local-thumbnail-category-label.spec.ts`

## REG-008 — Player keyboard arrows do not follow the visible 10-second controls

- Problem: On a Mac browser, the player offered visible 10-second back/forward buttons but the keyboard left/right arrows could not perform the same action.
- Reproduction: Open a watch page, leave focus on the page, then press the left or right arrow key.
- Correct behavior: Left seeks backward 10 seconds and right seeks forward 10 seconds. Inputs, textareas, selects, and editable text retain their native arrow-key behavior.
- Root cause: The custom player only wired seeking to pointer button handlers and had no page-level keyboard handler.
- Regression test: `e2e/regressions/player-keyboard-seek.spec.ts`

## REG-009 — Per-category daily viewing limits disappeared

- Problem: The management center previously allowed a viewing cap for each category, but later playback only enforced the shared leisure allowance.
- Reproduction: Set a category to 10 minutes, use all 10 minutes, then start another video from that category.
- Correct behavior: Video mode is blocked when that category reaches its cap, while pure listening remains available. Access polling reads a compact per-day category rollup instead of rescanning heartbeat history.
- Root cause: The newer learning/leisure allowance flow stopped enforcing the existing `daily_limit_seconds` category setting.
- Regression tests: `test/phase3.spec.ts` and `test/d1-cost-regressions.spec.ts`

## REG-010 — Authorized device list disappeared from parent settings

- Problem: The parent Settings page no longer showed authorized family devices, so the parent could not see the current device, rename devices, revoke access, or authorize the current browser.
- Reproduction: Log in as a parent, open `/parent/settings`, and look below the timezone section.
- Correct behavior: Settings loads and displays all family devices with current-device status and last-used time. Active devices can be renamed or revoked, and an unauthorized current browser can be authorized.
- Root cause: A parent-page rewrite left the device API, repository methods, styles, and row component intact, but removed the `parentRepository.devices()` call and the device section from `SettingsPage`.
- Regression test: `e2e/regressions/parent-device-list.spec.ts`
