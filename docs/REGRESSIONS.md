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

## REG-011 — Portrait local videos are cropped on desktop

- Problem: A portrait self-hosted video looked correct on iPad, but desktop playback expanded beyond the viewport and the top and bottom were missing.
- Reproduction: Open a portrait local-media watch page at a 1194×834 desktop viewport and start playback.
- Correct behavior: Both the local-video poster and the video element preserve the full frame with letterboxing when their aspect ratio differs from the player stage.
- Root cause: The native video used `object-fit: contain`, but its replaced-element intrinsic ratio still expanded the CSS Grid row (a real 720×960 video produced a 1920×2560 element). The fixed-height page then clipped that oversized row. The poster also inherited the shared YouTube `object-fit: cover` rule. Local video and poster now stay absolutely constrained to the player stage, with `contain` preserving the full frame.
- Regression test: `e2e/regressions/portrait-local-video-fit.spec.ts`

## REG-012 — Pure listening stops when an iPad screen locks

- Problem: A self-hosted leisure video played in pure-listening mode, but locking the iPad screen paused it.
- Reproduction: Open a self-hosted MP4 in pure-listening mode, start playback, and lock the iPad screen.
- Correct behavior: Pure-listening mode uses the browser's audio playback path so iPadOS can keep playing while the screen is locked. A leisure playlist advances in category order, loops from the final item to the first, remains in listening mode after every transition, and creates a distinct listening Session for each item even after viewing time is exhausted.
- Root cause: Pure listening only covered the visible `<video>` with CSS. The underlying media element was still a video, which Safari may suspend when it becomes invisible or the screen locks. Playlist navigation also passed `autoplay=1` while the native player forcibly reset its autoplay property to false. Finally, playback mode lived only in a route query and WatchPage retained the previous video's capability when React reused the route component, so advancing could lose listening intent or write through the previous Session.
- Regression test: `e2e/regressions/listen-background-audio.spec.ts`

## REG-013 — Phone portrait player controls overlap and are clipped

- Problem: On a phone in portrait orientation, the speed selector overlapped the play button, the right-side controls were clipped, and the back button wrapped awkwardly.
- Reproduction: Open a pure-listening watch page at a 390×844 viewport after the speed and next-item controls were added.
- Correct behavior: The scrubber, playback buttons, back/speed group, and volume slider all remain completely inside the viewport without overlapping.
- Root cause: The mobile grid tried to fit two wide utility groups in one row. A later desktop `.player-left-group` rule also overrode the earlier mobile row assignment due to cascade order, placing it back on top of the playback buttons.
- Regression test: `e2e/regressions/mobile-player-controls-fit.spec.ts`

## REG-014 — YouTube pure listening pauses after advancing to the next episode

- Problem: Qiaohu advances to the next episode in pure-listening mode, but the next episode remains paused.
- Reproduction: Start a Qiaohu YouTube episode in pure-listening mode, let it end, and wait for the playlist to advance automatically.
- Correct behavior: The next episode stays in pure-listening mode and starts playing automatically, including when the leisure viewing allowance is exhausted. Each episode still creates its own listening Session.
- Root cause: Every route-level `videoId` change destroyed the YouTube iframe and created a new one. Mobile Safari treated the replacement iframe as a new autoplay request and blocked it. The player now remains mounted and switches episodes through `loadVideoById()` so the active media session is preserved.
- Regression test: `e2e/regressions/youtube-listen-continuation.spec.ts`

## REG-015 — Self-hosted audio pauses after advancing to the next episode

- Problem: A leisure series backed by self-hosted audio, notably 神奇圖書館, advances to the next item in pure-listening mode but leaves it paused.
- Reproduction: Start a 神奇圖書館 item, let it finish in pure-listening mode, and wait for the next item.
- Correct behavior: The same native audio element changes source and continues playing automatically. Self-hosted MP4 pure listening follows the same path, and leaving the watch page still releases the media resource.
- Root cause: The native player's source-change effect ran its cleanup on every `src` update. That cleanup paused the element, removed its source, and called `load()`, breaking the user-started iOS media session before the next item could autoplay.
- Regression test: `e2e/regressions/listen-background-audio.spec.ts`

## REG-016 — iPhone stops self-hosted video sound when the screen locks

- Problem: Wow English keeps playing after an iPhone screen lock in pure-listening mode, but stops when it was started in viewing mode.
- Reproduction: Start a self-hosted Wow English MP4 in viewing mode on an iPhone, then lock the screen.
- Correct behavior: While the screen is visible, video and sound play normally. On iPhone/iPad the sound is driven by a synchronized audio master, so locking the screen may stop visual rendering but does not stop the lesson audio; unlocking resynchronizes the picture. Desktop playback remains on the normal single-video path.
- Root cause: iOS intentionally suspends background `<video>` playback. Pure listening already worked because it used `<audio>`, but viewing mode still used the video element as its only media session.
- Regression test: `e2e/regressions/ios-video-background-audio.spec.ts`

## REG-017 — iPad cannot resume by tapping the paused player

- Problem: After pausing on iPad, repeatedly tapping the video area did not resume playback.
- Reproduction: Play beyond two seconds, tap the player to pause, then tap one of the visible reminder questions instead of the small continue button.
- Correct behavior: The reminder remains visible while paused, but tapping anywhere on it resumes playback; the explicit continue button still performs exactly one play action.
- Root cause: The full-screen pause reminder was above the shared player tap target and intercepted every pointer event, while only its dedicated continue button called `togglePlay`.
- Regression test: `e2e/regressions/ipad-pause-overlay-resume.spec.ts`

## REG-018 — Playback mode and saved position leak into unrelated entry points

- Problem: Recent cards did not remember whether the session was viewing or pure listening; Home and category mode selectors drifted apart; selecting a regular video or auto-advancing could resume near the end and immediately skip again.
- Reproduction: Listen to a video, leave it near the end, switch a series mode inside its category, return Home, then enter through Recent, a normal video card, and automatic next.
- Correct behavior: Recent and explicit continue links preserve both the saved mode and position. Home/category selectors share one preference per learning/leisure series. Every other entry point, including normal cards, direct URLs and automatic next, starts at `0:00`; automatic next still preserves the current mode.
- Root cause: `view_sessions.playback_mode` was stored but omitted from resume/recent DTOs. Series preferences were only written by Home into `sessionStorage`, and WatchPage implicitly used the latest saved position whenever no `t` parameter was present.
- Regression tests: `test/phase2.spec.ts`, `e2e/features/learning-leisure-flow.spec.ts`, `e2e/regressions/recent-card-width.spec.ts`, `e2e/regressions/playback-position-stability.spec.ts`, and `e2e/regressions/youtube-listen-continuation.spec.ts`

## REG-019 — YouTube pure listening advances in the background with no audio

- Problem: After an iPad user resumes a Qiaohu episode from the lock screen, the current episode finishes, but the next episode appears to advance without sound; pausing from the lock screen can show the new item at 0:00.
- Reproduction: Start Qiaohu in pure-listening mode, lock the iPad, resume from the lock-screen media control, and let the episode advance.
- Correct behavior: The next YouTube episode is already queued in the same player before the initial user play gesture. Advancing must not issue a new `loadVideoById()` autoplay request, and the route, title, listening mode, and listening Session follow the video that YouTube advances to.
- Root cause: Keeping one iframe fixed REG-014, but the app still called `loadVideoById()` only after each episode ended. iPadOS treated that background call as a fresh scripted autoplay: production diagnostics showed the previous episode ending normally at 538 seconds, followed by the next episode stuck in `BUFFERING` at 0 seconds with `AUTOPLAY_NOT_STARTED`. A second race let the new route's `autoplay=1` parameter briefly reload the previous video before its content record finished loading.
- Regression test: `e2e/regressions/youtube-listen-continuation.spec.ts`
