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

## REG-020 — Learning audio reports playback but does not restart after screen lock

- Problem: DeepEng pure listening continues while an iPad is locked, but after the lesson repeats the progress display appears active with no sound; unlocking shows either 0:00 or the final second.
- Reproduction: Start a self-hosted learning video in pure-listening mode, lock the iPad, wake the still-locked screen near the end, and let the same lesson repeat. The timing is intermittent and may also occur without waking the display.
- Correct behavior: The same native audio media session loops from the beginning and its real current time continues advancing with sound while the screen remains locked. Per the later parent-configurable learning rule, it uses native loop for the configured number of plays, then advances within the currently selectable lessons; after the last selectable lesson it returns to the first.
- Root cause: The React `ended` handler synchronously called `seekTo(0)` and `play()`. Production diagnostics showed iPadOS emitting a new `playing` event within 0.1–0.2 seconds while the underlying timeline remained fixed at either 0 or 902 seconds. Learning audio now uses the media element's native `loop` behavior, so iPadOS performs the transition inside the already-authorized media session.
- Regression test: `e2e/regressions/listen-background-audio.spec.ts` (native loop stability and configured repeat-count wraparound)

## REG-021 — A play request made before local media is ready becomes a false connection error

- Problem: DeepEng viewing mode can briefly show the connection-error and retry screen even though the Mac, Tailscale and media request are healthy.
- Reproduction: Open a self-hosted video, press Play while metadata is still loading, and press Play again before the player becomes ready.
- Correct behavior: The first user gesture remains the pending play request; becoming ready must not pause it, duplicate taps must not create duplicate play promises, and an app-initiated `AbortError` must not start the 60-second network retry flow.
- Root cause: The ready handler always paused non-autoplay media, cancelling the pending user `play()` promise. Its expected `AbortError` was then handled as a Mac/Tailscale connection failure.
- Regression test: `e2e/regressions/media-auto-retry.spec.ts`

## REG-022 — Directly opening the downloaded-media page returns Worker 404

- Problem: Navigating from the home page to `/downloads` works, but typing or reloading that URL returns a JSON `Not Found` response in production.
- Reproduction: Deploy the Worker and directly request `/downloads` instead of reaching it through React Router.
- Correct behavior: Every non-API GET/HEAD route is resolved by Cloudflare's SPA asset binding and returns the app shell; `/api/*` routing remains handled by the Worker.
- Root cause: The Worker handled every request first and rejected non-API paths before Cloudflare's SPA fallback could serve `index.html`.
- Regression tests: `test/index.spec.ts` and `e2e/features/download-series.spec.ts`

## REG-023 — Downloaded video stays forever on “preparing player” when the network is unusable

- Problem: A downloaded DeepEng lesson remains on「正在準備播放器」when the phone has a network interface but cannot reach the Worker.
- Reproduction: Download a series, keep `navigator.onLine=true`, make content/device API requests remain pending without resolving or rejecting, and open the downloaded lesson.
- Correct behavior: Links from「已下載」read device, video and category snapshots immediately without requesting the network. Other entry points wait at most 1.2 seconds per cached request before using the snapshot; the player mounts with a local Blob URL.
- Root cause: Offline fallback ran only when `navigator.onLine=false` or `fetch()` rejected. iOS can keep `navigator.onLine=true` while an unreachable request remains pending indefinitely.
- Regression test: `e2e/features/download-series.spec.ts`

## REG-024 — Downloaded DeepEng reports playing but remains at 0:00 on iPhone

- Problem: After downloading DeepEng, opening it in viewing mode on an online iPhone changes the player to a playing state, but the picture and timeline remain at `0:00`.
- Reproduction: Download the DeepEng series, open a downloaded lesson in viewing mode on iPhone, and press Play.
- Correct behavior: Downloaded viewing uses the local file without contacting the Mac, one native video timeline advances, and a stalled timeline never consumes allowance or creates learning credit.
- Root cause: The iOS viewing path opened the same large OPFS-backed `blob:` URL in both an audio master and a visual video. WebKit could resolve `play()` and emit `playing` while the audio master's timeline stayed at zero. Heartbeats then incorrectly converted elapsed wall-clock time into played time without confirming media progress.
- Regression test: `e2e/regressions/downloaded-video-playback.spec.ts`

## REG-025 — Downloaded series loses its thumbnails offline

- Problem: DeepEng media plays after the phone goes offline, but every video thumbnail disappears.
- Reproduction: Download a self-hosted series while online, turn off all networking, and reopen the category.
- Correct behavior: The download operation saves each non-placeholder thumbnail, the offline category displays it through the Service Worker, retrying fills missing thumbnails without re-downloading completed videos, and deleting the series removes unused cached thumbnails.
- Root cause: Phase 1 of offline downloads stored MP4/MP3 files and metadata only. Thumbnail URLs still pointed to R2, while the Service Worker deliberately ignored all cross-origin image requests.
- Regression test: `e2e/features/download-series.spec.ts`

## REG-026 — Installed Web App waits too long before opening offline

- Problem: After networking is disabled, reopening the installed iPhone Web App shows a blank/loading state for a noticeable time before the downloaded UI appears.
- Reproduction: Open the installed Web App once online so its shell is cached, disable all networking, fully close it, then launch it again from the Home Screen.
- Correct behavior: A controlled launch returns the cached app shell immediately; downloaded data then renders from local snapshots without waiting for a failed navigation request.
- Root cause: The Service Worker used network-first navigation. iOS can take a long time to reject an unreachable `fetch()`, even though a valid app shell is already cached.
- Regression test: `test/offline-shell.spec.ts`

## REG-027 — Lock-screen pause then play advances silently in pure listening

- Problem: Pure listening works while an iPhone is locked, but pausing and resuming from the still-locked screen can advance the timeline with no sound.
- Reproduction: Start a self-hosted item in pure-listening mode, lock the phone, press Pause in the lock-screen media controls, then press Play without unlocking.
- Correct behavior: The lock-screen controls explicitly pause and resume the app's audio element at the previous position. While hidden, resume preserves the loaded source and buffer (REG-063); the existing source-rebind repair is restricted to the foreground.
- Root cause: The app relied on WebKit's default Media Session action. A WebKit failure mode allows `HTMLMediaElement.play()` to resolve and time to advance while the PWA's audio output remains silent after a system-level pause.
- Regression test: `e2e/regressions/listen-background-audio.spec.ts`

## REG-028 — Learning-series pure listening is recorded but absent from accumulated time

- Problem: WowEnglish can be played for hours in pure-listening mode and the Sessions/Heartbeats exist in D1, but the learning total and the category card appear not to increase.
- Reproduction: Start a learning-series item in pure-listening mode, play for at least one heartbeat, then inspect the child access state, the category card, and the parent daily summary.
- Correct behavior: Pure listening accumulates in the pure-listening total and the category's displayed activity time. When the category is a learning series, the same time also counts as learning time. It never consumes leisure/category viewing limits and never earns leisure bonus time.
- Root cause: The usage classifier treated `listen` as mutually exclusive from `learning`, and category rollups deliberately queried and updated only video-mode Sessions.
- Regression test: `test/learning-leisure.spec.ts`

## REG-029 — Opening video management loads every video before a category is chosen

- Problem: Entering the parent video-management page immediately loads nearly two thousand video records, thumbnails, and every category mapping even though the parent only intends to edit one series.
- Reproduction: Open `/parent/videos` and inspect network/D1 activity before selecting any category.
- Correct behavior: The initial page requests only categories and their counts. It requests videos only after a category is selected, loads thumbnails lazily, and fetches category mappings only for the returned videos. A thumbnail visibly shows whether its playback range is unchanged or configured.
- Root cause: The page used `category=all` as its initial state, while the Worker unconditionally queried the complete `videos` and `category_videos` tables.
- Regression test: `e2e/features/parent-video-category-loading.spec.ts`

## REG-030 — Large categories fail to open in parent video management

- Problem: A small category such as 泉靈語文 loads normally, while a large category such as 可愛巧虎島 shows「伺服器暫時發生問題」instead of thumbnails.
- Reproduction: Create or open a category containing more than D1's allowed number of SQL bind variables, then select it in `/parent/videos`.
- Correct behavior: Categories of any current project size load successfully without constructing one SQL placeholder per video.
- Root cause: The optimized mapping query generated `WHERE video_id IN (?, …)` with every returned video ID. At 112 videos the real D1 runtime reproducibly raised `D1_ERROR: too many SQL variables`; 巧虎 contains about 284 videos.
- Regression test: `test/learning-leisure.spec.ts` (`loads a large parent category without exceeding D1 bind limits`)

## REG-031 — Global YouTube health check is misleading inside one category

- Problem: While viewing a small category, the video-management page reports hundreds of abnormal videos because its bulk health check silently scans every active YouTube video in the app.
- Reproduction: Open `/parent/videos`, select 泉靈語文, then press the global health-check action and compare the checked count with the selected category count.
- Correct behavior: Video management does not expose the misleading global bulk action. A parent can still refresh Metadata for an individual YouTube video from that video's controls.
- Root cause: The category-scoped management UI retained a legacy account-wide health-check button, and temporary YouTube API failures were also counted as abnormal videos.
- Regression test: `e2e/features/parent-video-category-loading.spec.ts`

## REG-032 — Fifth learning lesson links into the locked sixth lesson

- Problem: Pressing「下一集」from the fifth currently selectable learning video opens the locked sixth video, then shows「請先從前五部學習影片中選擇」with a retry button that can never succeed.
- Reproduction: Open the fifth unlearned item in a learning category that has at least six unlearned videos, then press「下一集」.
- Correct behavior: A locked adjacent lesson is not offered as the next item and is excluded from the playback queue. Opening a locked URL directly shows a clear locked explanation with navigation away, not a retry loop. Once learning progress makes the sixth lesson selectable, the fifth lesson may offer it normally.
- Root cause: `WatchPage` and the session playback queue used raw category order without checking each video's server-provided `isSelectable` flag; the generic load-error component also treated an authorization rule as a transient network failure.
- Regression test: `e2e/regressions/learning-next-track-lock.spec.ts`

## REG-033 — A lesson shown in today's first five is blocked when it also belongs to another category

- Problem: WowEnglish lessons 005 and 006 appear in「今天的學習開始囉」but opening either lesson shows「這一步還沒開放」.
- Reproduction: Put an unlearned video inside the first five available items of its course, and also add the same video later than fifth place in another learning category such as「我最喜歡」; open it from the course.
- Correct behavior: A video is playable when it is currently within the first five unlearned items of at least one of its active learning categories. It is locked only when none of its learning categories currently exposes it.
- Root cause: The detail API treated every category membership as a veto, so a later rank in「我最喜歡」overrode the valid first-five rank in WowEnglish. The category list and video-detail endpoint therefore disagreed.
- Regression test: `test/learning-leisure.spec.ts` (`opens a video that is in the first five of one learning category even when another category ranks it later`)

## REG-034 — Favorites incorrectly inherits the five-lesson learning lock

- Problem:「我最喜歡」is intended as an unrestricted shortcut, but items after its first five are shown as locked and can also cause an otherwise available course lesson to be rejected.
- Reproduction: Add more than five unlearned videos to「我最喜歡」and open an item after the fifth position.
- Correct behavior: Every active item in「我最喜歡」is selectable. Original learning-course categories still expose only their first five unlearned lessons.
- Root cause: The shared learning-category selection code applied the course progression limit to every category whose `series_type` was `learning`, without recognizing the system favorites category as an unlimited collection.
- Regression test: `test/learning-leisure.spec.ts` (`does not apply the first-five lock to the favorites learning category`)

## REG-035 — Per-video favorites hearts disappear from category pages

- Problem: The heart at the upper-right of every learning-video card disappears, so a child cannot add a video to or remove it from「我最喜歡」.
- Reproduction: Open a learning category such as WowEnglish and inspect a video card; no favorite control is available. Open「我最喜歡」and there is likewise no way to remove an item.
- Correct behavior: Every learning-video card has an empty or filled heart reflecting its D1 membership. Tapping it adds or removes that video, persists across devices, and immediately refreshes the current list.
- Root cause: The current Git version retained the `learning-favorites` category and its D1 memberships but had neither a committed child favorite endpoint nor the per-card heart UI. A page-level shortcut was briefly added after misinterpreting the report, then removed when the intended behavior was clarified.
- Regression tests: `test/learning-leisure.spec.ts` (`adds and removes a learning video from favorites through the child API`) and `e2e/regressions/favorites-shortcut.spec.ts`

## REG-036 — Favorites is incorrectly presented as course progress

- Problem:「我最喜歡」splits saved videos into「今天的學習開始囉」and「已學會」and shows learned controls, even though favorites is a collection rather than a course.
- Reproduction: Favorite a video already marked learned, then open the favorites category.
- Correct behavior: Favorites shows one collection ordered by favorite order, with no learned grouping, learned badge, learned timestamp, or learned toggle. Removing a favorite does not alter that video's learned state in its original course.
- Root cause: The generic learning-category page and SQL ordering were reused for the special favorites category without separating collection behavior from course-progression behavior.
- Regression tests: `e2e/regressions/favorites-shortcut.spec.ts` and `test/learning-leisure.spec.ts` (`adds and removes a learning video from favorites through the child API`)

## REG-037 — Player volume and speed reset after returning to a series

- Problem: A child changes the player volume or speed, presses「回去」and opens another episode, but the controls return to 100% and 1.0x.
- Reproduction: Open the first video in a series, choose 35% volume and 0.8x speed, return to the series, then open its second video.
- Correct behavior: Every device remembers one volume and speed pair for each series. Episodes in the same series reuse it after navigation or reopening, while another series keeps its own independent settings.
- Root cause: `WatchPage` stored both controls only in component state, which was destroyed whenever the route left the player.
- Regression test: `e2e/regressions/player-series-preferences.spec.ts`

## REG-038 — Multi-child dashboard totals disagree with quota enforcement

- Problem: The parent dashboard can show a child has used 0 minutes and still has leisure time remaining even though the same page's detailed summary shows about one hour of leisure viewing; playback is already blocked by the quota rule.
- Reproduction: Preserve existing Sessions and Heartbeats, enable the two-child migration, then view 阿云's daily dashboard when the new `child_daily_usage` rollup is absent or stale. Also compare category limits and simultaneous playback for 阿云 and 阿涵.
- Correct behavior: Each child independently accumulates quota, category viewing time, learned state, favorites, and history across all authorized devices. Overlapping devices for one child count once; two different children watching simultaneously each count. Dashboard summaries and playback enforcement show the same per-child total.
- Root cause: The multi-child migration did not rebuild existing per-child daily rollups, category rollups remained account-wide, and new heartbeats reused an account-wide overlap delta when updating the current child's row. The all-children dashboard also deduplicated simultaneous playback across different children.
- Regression test: `test/multi-child.spec.ts` (`MC 07`, `MC 08`, and `MC 09`)

## REG-039 — Learned markers disappear after enabling multiple children

- Problem: Videos marked learned shortly before the multi-child release, including 43 lessons in `斑馬英語 S1 (第01-12周)`, no longer appear learned after the release.
- Reproduction: Apply the multi-child schema migration while the old Worker is still live, mark more videos learned through that Worker, then deploy the multi-child Worker and open the same category as 阿云.
- Correct behavior: Every completion created before the multi-child Worker deployment remains assigned to 阿云 with its original completion timestamp. 阿涵 remains independent, and a repair must not overwrite newer per-child state.
- Root cause: Migration `0015` copied `video_learned_state` to `child_video_learned` once on 2026-09-27, but the old Worker continued writing only to the legacy table until the multi-child Worker was deployed on 2026-10-06. The new Worker correctly reads the per-child table, leaving records created in that deployment window invisible.
- Regression test: `test/multi-child.spec.ts` (`MC 10`)

## REG-040 — Long picturebook guides expand beyond the iPad instead of scrolling

- Problem: Opening a rich mother reading guide produces a content area taller than the viewport, so setting its scroll position has no effect and returning restores the top.
- Reproduction: Open picturebook 001 page 4, open「媽媽陪讀指南」, scroll, return to the picturebook, then reopen the guide.
- Correct behavior: The guide content scrolls inside the available viewport; navigation remains visible and each page restores its independent position. Guide previews never change picturebook progress.
- Root cause: Vertical auto margins on the nested guide grid let it grow with its content instead of occupying the bounded reader grid row. Explicit row height and bounded overflow restore the internal scroll container.
- Regression test: `picturebooks/test/guide.spec.ts` (`guide scroll position survives closing and page navigation`) in Chromium and WebKit, iPad landscape and portrait.

## REG-041 — Picturebook slow speech is too close to normal to help with listening

- Problem: The user reports no perceptible difference between normal and slow reading.
- Reproduction: Listen to the same guide sentence with normal rate 1.0 and the original slow setting 0.8.
- Correct behavior: Slow uses rate 0.6 to request a stronger difference; selecting speed cancels playback, and tapping the same sentence again speaks with the selected rate. Previously saved slow selections migrate to 0.6 without losing favorites or scroll positions. Actual acoustic timing still depends on the device voice.
- Root cause: The original 0.8 setting offered only a modest separation from 1.0. Automated tests verified the API value, not perceptual audibility on the user's device.
- Intended behavior update: In response to the user's 2026-10-11 report, slow-rate expectations change from 0.8 to 0.6; normal remains 1.0 and selecting a speed never starts speech automatically.
- Regression test: `picturebooks/test/guide.spec.ts` (`legacy preference migrates to a clearly slower rate and the same sentence can be compared`), plus existing speech switching, persistence and error/stop flows in Chromium/WebKit iPad layouts.

## REG-042 — Image-only picturebooks show a guide button despite having no guide

- Reproduction: Load a catalog book explicitly marked `guide: false`, open it, turn a page and reload.
- Correct behavior: Image-only books hide the guide button and preserve ordinary reading/progress; switching to an existing guided book restores the button.
- Root cause: The reader previously assumed every book offered a guide, so image-only books exposed a button that would load missing content.
- Intended behavior update: The user requested new books without guides on 2026-10-12 and confirmed uploading new source images on 2026-10-14. Guide coverage tests now apply to guide-enabled books; the original 18 books/244 guided pages remain required. New books 19–28 are explicitly image-only, not silently missing guides.
- Regression test: `picturebooks/test/reading.spec.ts` (`image-only books hide the guide, turn pages and resume while existing guides remain available`), with all-book matching in `guide.spec.ts` and explicit release coverage in `guide-content.test.mjs`.

## REG-043 — Novel reading position shifts when changing text size

- Scope: Independent private Sites reader, maintained source backup in `storybooks/super-ya-novel/`.
- Reproduction: Read the guide quotation around first-chapter blocks 37–38, leave only a sliver of the preceding paragraph below the toolbar, then choose「特大」or toggle phonetics.
- Correct behavior: The readable paragraph keeps its screen position. Reopening resumes a text-block anchor, including after viewport changes; old five-chapter pixel positions remain a migration fallback.
- Root cause: Choosing the first paragraph with any remaining pixels below the toolbar anchors the mostly hidden preceding paragraph; its new line wrapping pushes the paragraph actually being read down the page.
- Fix: Ignore that trailing sliver and preserve the chosen block's offset relative to the compact toolbar. Store block anchors with chapter, map progress and preferences.
- Intended behavior update: On 2026-10-15 the user explicitly approved removing supplementary chapter-end conversations. Original five-chapter prose and embedded questions remain exact; old choice/reply expectations are replaced with quotation, screenshots and spoiler-aware story-map checks.
- Regression test: `storybooks/super-ya-novel/tests/reader-flow.js` — changing font keeps the current paragraph anchored; annotation toggle preserves the reading anchor; reopening resumes the exact saved text anchor; existing five-chapter pixel position remains a migration fallback. Run with the independent reader's local server on port 4178.
- 2026-10-16 intended entry-point update: The user explicitly requested retaining both stories with links. The root URL now opens a two-book shelf; this historical reader flow opens `?book=super-ya` and retains all 103 expectations. `tests/library-flow.js` additionally verifies separate per-book positions/preferences, exact Kiki source rendering, cross-book links and storage-blocked reading.
- 2026-10-16 settings UI update: The user requested one fixed button containing all settings. Font size and phonetics now share the bottom-right disclosure. Historical flows open that disclosure before adjusting phonetics; every original reading-position and persistence expectation remains. `tests/settings-flow.js` additionally covers fixed positioning, both settings inside the panel, keyboard/focus dismissal and viewport bounds.

## REG-044 — Reading progress disappears when reloading during upload

- Scope: `storybooks/super-ya-novel/public/cloud.js`, independent Cloudflare reader.
- Reproduction: Change font size, hold the save request before acknowledgement, reload, then reconnect.
- Correct behavior: Pending progress stays durable until the server acknowledges it. Reload overlays pending changes on the cloud snapshot; reconnect eventually saves them.
- Root cause: Clearing the local queue when starting a request discarded its only durable copy before the server confirmed the write.
- Fix: Persist in-flight patches together with newer pending changes until acknowledgement.
- Regression test: `storybooks/super-ya-novel/tests/cloud-recovery-flow.js` (4 checks, local Worker/D1 only).
- Intended behavior update: On 2026-10-16 the user requested one child's shared cloud progress and parental review, with separate comprehension and complete whispers modes. Existing source text, reading anchors and independent per-book settings remain covered by REG-043 flows.

## REG-045 — Settings disappear on episode entry and phonetics reset across modes

- Reproduction: Open `?book=kiki` before starting; the old fixed settings control is absent. Turn phonetics off in whispers, then navigate to comprehension or another episode; its separate saved/default preference turns phonetics back on.
- Correct behavior: Episode entry and both reading modes expose the same left tools drawer. Font, phonetics, vocabulary hints and voice rate are one shared cloud preference; reading location and question history remain separate.
- Root cause: The settings markup was mounted only inside the whisper reader, and each book/mode independently owned display preferences.
- Fix: Reuse the drawer markup and a dedicated `reading:settings` document with a durable pending queue. Seed the first shared value from the current mode's existing cloud/local preferences. Both modes show direct switches that preserve the matching chapter/scene.
- Intended behavior update: On 2026-10-16 the user explicitly requested a left drawer containing progress/settings/navigation, keeping phonetics off while changing pages, using the whispers reading layout for comprehension, and direct switching between modes. Library flow expectations now share display preferences while preserving every original per-book position/content assertion. Modal drawer flows dismiss the drawer before using background navigation.
- Tests: `tests/settings-entry-flow.js`, `tests/drawer-flow.js`, `tests/shared-settings-flow.js`, `tests/mode-switch-flow.js` under `storybooks/super-ya-novel/`; existing settings/reader/library/learning flows remain in use.

## REG-046 — Root bookshelf lacks tools and duplicate toolbars distract from reading

- Reproduction: Open the actual entry URL `/` instead of an episode URL; no settings control is present. Episode-only coverage missed the root route.
- Correct behavior: Root shelf, episode entry and both reading modes share the tools drawer and global preferences. Root actions update only shared settings; existing per-book progress is preserved.
- Root cause: `shelf()` did not mount the shared drawer, and the settings handler assumed a selected book.
- Fix: Reuse a single controls renderer on the shelf and episode pages; guard shelf saves so they cannot create an undefined book key or write chapter progress.
- Intended behavior update: The user requested top placement and less interference with reading on 2026-10-16. Entries use a labeled top button; reading uses a 48px menu in the existing navigation row, without an extra toolbar or large mode cards. Header and drawer links preserve corresponding mode switches.
- Tests: `storybooks/super-ya-novel/tests/shelf-settings-flow.js` (root route, 30 checks, touch viewport simulation at 820x1180, 1180x820 and 390x844); `tests/mode-switch-flow.js` checks quiet reading layout and mode navigation. Existing settings/reader/library flows preserve their behavior checks.

## REG-047 — Scroll capture stops on changing thumbnails despite valid scrolling content

- Scope: `picpick-replacement/Stitching.cs`, `ScrollCapture.cs`, `Native.cs`.
- Reproduction: Capture scrolling video suggestions; a thumbnail changes between frames and the old RGB-wide score rejects a real 100px displacement.
- Correct behavior: Match unchanged content with an exact strip, then the recovered PicPick brightness comparison; append the measured displacement, retain accepted pixels on Esc and confirm the bottom across repeated unchanged frames.
- Evidence: Local 539×720 failure replay selects 100px at 0.9158805912 using the recovered formula. Standard scroll input and wheel fallback are retained; each displacement is revalidated and low-confidence results stop with recovery data.
- Tests: `picpick-replacement/tests/Program.cs` (changing-thumbnail replay through the complete scroll coordinator, Esc/bottom and unrelated-frame rejection); `research/test_scroll_model.py`. The optional `--replay <local-recovery-directory>` check uses local user images without committing them.
- Desktop target regression: Resolve the selected window before closing the overlay, since modal close can reactivate a different application. The hollow green frame is outside the capture rectangle. User confirmed long capture OK on 2026-10-16; broad cross-application equivalence remains unproven.

## REG-048 — Drawing tools only add objects and paste opens an unwanted document

- Scope: `picpick-replacement/ImageCanvas.cs`, `Annotations.cs`, `WorkbenchForm.cs`.
- Reproduction: Place a stamp or rectangle, then try to drag it without choosing Select; the old handler adds another object. Ctrl+V always opens a new tab.
- Correct behavior: Existing objects and handles take priority over creating another object. New objects are immediately selected, number stamps are centered and increment only when placed, and blank space remains available for the next stamp. Paste creates a selected image object in the current document, with independent movement and proportional corner resize.
- Fix: Separate persistent objects from the bitmap background, retain per-document history, use geometric hit tests and eight handles (two endpoints for lines/arrows), and distinguish paste-in-document from explicit paste-to-new-tab.
- Tests: `picpick-replacement/tests/CanvasUserFlows.cs` runs number placement → direct drag → next number → rectangle drag → image paste → image move/resize → arrow endpoint → select all → save/close. `tests/Program.cs` covers object persistence, per-tab isolation and saving failures. Desktop Ctrl+A/C/V/S and drag/resize checks are recorded in `tests/UI-VERIFICATION.md`.
- Intended behavior updates, 2026-10-16: User explicitly changed autosave from every edit to capture-only during editing, then added automatic final save on closing and a fresh workspace at startup. Historical edit/undo tests now require no disk writes until explicit save; close tests require final pixels to be saved and `Open=false`. This is a requested change, not a weakened expectation for broken behavior.

## REG-049 — Minimizing to the notification area loses the capture shortcut

- Scope: `picpick-replacement/WorkbenchForm.cs`.
- Reproduction: Hide the editor while changing ShowInTaskbar, then use the registered capture shortcut; no selection overlay appears.
- Root cause: Changing ShowInTaskbar recreates HWND and discards the hotkey registered to the old handle.
- Fix: Hide the existing window without changing ShowInTaskbar; restore that window from NotifyIcon or the single-instance open channel. Share one custom icon between the executable, window and notification area.
- Regression flow: `picpick-replacement/tests/UI-VERIFICATION.md`: minimize → Ctrl+Alt+2 from another app → top mode strip → switch region/scroll. The selection dialog remains discoverable by accessibility tools. Windows login startup uses a quoted executable plus `--tray`, with its command checked by `tests/Program.cs`.

## REG-050 — Pasting a large image into a small canvas silently loses resolution

- Scope: `picpick-replacement/ImageCanvas.cs`, `WorkbenchForm.cs`, `NewCanvasForm.cs`, `CanvasSizeForm.cs`.
- Reproduction: Paste an 800×600 image into a 200×150 document. The previous insertion calculation shrank the floating object to 160×120, even though its encoded source retained 800×600 pixels.
- Correct behavior: Paste preserves original pixel dimensions, leaves the existing output canvas unchanged, and allows the floating image to move outside its bounds. Merge keeps only pixels within that canvas; undo restores the complete movable object. Canvas resize adds/crops space without resampling; image scaling remains a separate command.
- Intended behavior clarification, 2026-10-16: The user explicitly rejected automatic canvas enlargement. New blank documents may instead use clipboard dimensions, or clipboard content may directly create a matching-size document. These are distinct from pasting into an existing document; REG-048 direct object editing remains required.
- Fix: Remove insertion fit scaling, retain integer pixel placement, include floating objects in the scrollable workspace, and add Merge plus separate outer canvas handles and size dialog. Default the new-image dialog to clipboard dimensions with separate blank/content actions.
- Tests: `picpick-replacement/tests/CanvasUserFlows.cs`: `LargePasteKeepsPixels`, `PasteMergeAndResizeCanvas`, `ClipboardCanvasSize`, plus the existing complete editor flow. The merge flow verifies saved dimensions and an exact one-pixel red stripe after negative-position dragging, merge/undo, transparent expansion, outer-handle drag and shrink. Desktop Ctrl+C/V, merge, save, canvas drag and both new-document choices are recorded in `tests/UI-VERIFICATION.md`.

## REG-051 — Canvas cannot be resized from the left or top

- Scope: `picpick-replacement/ImageCanvas.cs`.
- Reproduction: Try dragging the left, top or top-left outer frame. Only right, bottom and bottom-right controls existed; resizing always anchored the top-left origin.
- Intended behavior update, 2026-10-16: The user explicitly requested left/top resizing. Dragging any of eight handles grows/crops from that edge, with the opposite edge fixed during preview. Numeric canvas sizing continues to anchor top-left.
- Fix: Track a preview rectangle instead of only width/height, add all eight directional handles/cursors, and translate the background and floating objects together when the output origin changes. Pixel dimensions are never resampled; merge retains its existing bounds-clipping behavior.
- Tests: `CanvasUserFlows.CanvasAllEdges` drives all eight handles at 100% and 50%, growing and shrinking (32 cases), then checks output dimensions, exact one-pixel lines, floating object positions, saved dimensions, a single undo step, undo restoration and cancelled-drag stability. Existing REG-048/050 editor and paste/merge flows remain required.

## REG-052 — Explorer image files cannot be dropped into the editor

- Scope: `picpick-replacement/ImageFileDrop.cs`, `ImageCanvas.cs`, `WorkbenchForm.cs`.
- Reproduction: Drag PNG files from Explorer to an existing image or the empty workspace; the old controls did not register a file-drop target.
- Correct behavior: Copy supported images into the current canvas as original-size editable objects; leave its output bounds unchanged. With no document, create a matching-size document for each image. Multiple image files are supported and unrelated file types are ignored.
- Fix: Register native WinForms file-drop targets on the canvas and workspace, share file filtering/loading, and isolate per-file loading errors. Retain immediate object selection and direct dragging from REG-048.
- Tests: `CanvasUserFlows.ExplorerImageDrop` delivers native `DataObject(FileDrop)` through the actual canvas DragEnter/DragDrop handlers, checks multiple sizes, filtering, dirty state and direct dragging, and covers the empty workspace binding. Desktop evidence and the automation limitation are recorded in `tests/UI-VERIFICATION.md`.

## REG-062 — Titlebar close exits instead of retaining the editor in the notification area

- User-approved behavior change, 2026-10-19: Window X, Alt+F4 and minimize hide to the tray, retaining the current tabs and pending edits. Only the explicit tray Exit action ends the session and saves/forgets tabs. This supersedes REG-048's earlier interpretation of titlebar close; explicit document close and final-save tests remain unchanged.
- Fix: Separate hiding from an explicit exit request, cancel UserClosing unless exit was requested, and retain the existing HWND/hotkey. Exit during capture requests cancellation and completes after capture cleanup. Failed final saving retains the window. The related editor request adds a separate rounded-frame tool, typed decimal line widths with validation, and 6px averaged mosaic cells instead of 12px single-point sampling.
- Compatibility: Append the rounded-frame enum value, preserving numeric identities in existing document histories. Keep independent editable marks, custom stroke persistence, undo and selected-region mosaic boundaries.
- Tests: `EditorPolishFlows.TrayLifecycle`, `ManualWidth`, `RoundedFrames`, `FineMosaic` exercise actual form-close and tray-exit handlers, pending disk state, preset/manual input and rejection, rounded-corner pixels/direct dragging, saved geometry, fine-cell means/edges and undo. The existing REG-048/049/050 editor, hotkey, paste and close flows remain required. Desktop evidence is recorded in `picpick-replacement/tests/UI-VERIFICATION.md`.

## REG-061 — Arrow keys do not nudge the capture cursor by one pixel

- Requested behavior, 2026-10-17: While the capture magnifier is visible, arrow keys move the actual cursor by one screen pixel. During a mouse drag, nudge the endpoint while keeping the initial anchor fixed; preserve Esc and modified shortcuts.
- Fix: Intercept plain arrows before WinForms dialog navigation, move the OS cursor with SetCursorPos in physical desktop coordinates, read its actual resulting position, and update the magnifier and active selection. Clamp to virtual desktop bounds, including negative monitor coordinates. Regular mouse-up still uses the final pointer position.
- Tests: `OverlayUserFlows.ArrowKeys` exercises the actual command-key handler with deterministic cursor IO for region and scroll modes, all four directions, exact one-pixel deltas, magnifier synchronization, all desktop boundaries, modifier preservation and the final nudged capture rectangle. Existing REG-060 magnifier, reverse-drag and Esc flows remain required.

## REG-060 — Capture selection lacks pixel magnification around the cursor

- Requested behavior, 2026-10-17: Show a cursor-following pixel magnifier while choosing capture endpoints, including before dragging. Preserve the region/scroll mode strip and existing successful capture/clipboard behavior.
- Fix: Render a nearest-neighbor 8× preview of 17×17 original screen pixels, with a center-pixel outline, crosshair, global coordinates and selection dimensions. Place it within the current monitor, avoiding the cursor and toolbar; clamp sampling at desktop edges and preserve the immutable background used for final capture.
- Tests: `OverlayUserFlows.HoverMagnifier`, `PixelsAndEdges`, `SelectAndCancel` cover the actual overlay paint/mouse handlers, exact pixel centers and edge padding, negative desktop coordinates, all screen corners, reverse selection, last mouse-up position, scroll mode/minimum size and Esc cancellation. Existing REG-047/049/057 scroll, shortcut and clipboard tests remain required. Real desktop evidence is in `picpick-replacement/tests/UI-VERIFICATION.md`.

## REG-057 — Captured images are not automatically available in the clipboard

- Scope: `picpick-replacement/AppSettings.cs`, `CaptureCompletion.cs`, `WorkbenchForm.cs`.
- Requested behavior, 2026-10-17: Add an optional capture-to-clipboard setting. It defaults on for new and existing settings, persists opt-out, and applies to both region capture and the complete scrolling result. Ordinary editing/import/paste does not automatically replace the clipboard.
- Fix: Add the general-settings checkbox and route both successful capture branches through shared completion: save PNG, open its document, then copy the full saved bitmap using the existing PNG/bitmap clipboard writer. Clipboard errors only affect the completion status; the saved image stays open and editable. Cancelled selection never enters completion, and saving failure does not copy incomplete output.
- Tests: `picpick-replacement/tests/Program.cs` covers missing/legacy settings, opt-out round trip, the actual settings checkbox save handler, standard/long bitmap completion, exact pixels and alpha, disabled copying, clipboard contention retaining a saved editable document, and failed saving not opening/copying an incomplete capture. All historical capture, scroll, editor and canvas flows remain required.

## REG-053 — Reading navigation labels and URLs disagree with the displayed page

- Scope: `storybooks/super-ya-novel/public/app.js`, `practice.js`, `drawer.js`.
- Reproduction: Choose a chapter/scene, switch to extra reading, return to all scenes, then reload or use browser Back. The old UI changed without updating the URL. Practice header and drawer whisper links could also lead to different places, while two differently labeled header links both returned to the cover.
- Correct behavior: Back-to-cover always opens the selected episode entry; mode links in the header, cards and drawer agree on the corresponding scene; root shelf links stay at `/`. The URL identifies the active chapter/scene/level, reload stays in that view, and browser Back/Forward follows navigation.
- Fix: Synchronize browser history with whisper and comprehension navigation. Clear deep-link parameters on cover/list views. Use the existing chapter anchors and preserve the exercise phase on reload. Align opposite-mode links and render the current whisper mode as a non-link marker in its drawer.
- Intended behavior update: On 2026-10-16 the user asked to carefully review inconsistent top links. Reload now opens the current reading view directly rather than adding a cover/resume step. Historical reader/library/recovery flows wait for the reading view after reload; every saved-anchor, settings and original source assertion remains required.
- Regression test: `storybooks/super-ya-novel/tests/navigation-flow.js` (both episodes; 38 checks). Also verifies the requested Kiki hint removal and source-only footer character counts. Maintained reader/library/mode-switch/settings/shelf/drawer/learning/shared-settings/cloud-recovery flows remain required.

## REG-054 — Child navigation exposes mode and parent shortcuts and mixes legacy exercise progress

- Scope: `storybooks/super-ya-novel/public/{app,practice,drawer,parent,parent-gate}.js`, content registry, build and Worker progress validation.
- User-approved behavior change, 2026-10-17: one fixed settings/shelf/cover header replaces all earlier cross-mode links. A neutral episode cover is the only mode-switch entry. The former extra-reading tab and two questions per unit are retired; original extra records remain visible only as parent history. This supersedes REG-053's earlier requirement for matching opposite-mode links and level=extra routes.
- Fix: shared header uses viewport-based width so scrollbar appearance does not shift its columns. Modes have separate routes, resumes, reading anchors and catalog counts. Legacy extra URLs normalize to the same comprehension unit; archived attempts and notes survive without contributing to the current denominator.
- Parent gate: hold three seconds, cancel on release/move, direct old parent URLs show the gate, background removes parent DOM and requires a new hold, and return-child preserves route/anchor. No unlock is persisted. Statistics distinguish location, answer attempts, hint layers, retries, explanations and ungraded notes.
- Authoring: Kiki manuscript remains byte-for-byte unchanged; new authoring spec, separate passages/questions/answers, original source evidence, schema checks and draft importer preserve the approved story distinctions. A 2-whisper/3-practice test book verifies independent bounds and routes without publishing a fixture. Preview has isolated storage and makes no progress API calls.
- Tests: new `edition-flow.js` (91 checks), `practice-position-flow.js` (3), `preview-flow.js` (7), authoring and independent-count Worker tests. Maintained reader/library/settings/settings-entry/shelf-settings/drawer/navigation/mode-switch/learning/shared-settings/cloud-recovery flows all pass with explicitly requested selectors/routes/count changes; original manuscript, annotation, anchor and cloud durability checks remain. Node suite: 17 tests. iPad sizes are Chromium simulations, not physical Safari tests.

## REG-055 — Resume-card typography scatters Bopomofo and locked answers lose contrast

- User-approved entry change, 2026-10-20: both cover cards now expose exactly one primary link to their own contents. Start/resume remains on the corresponding contents page. Historical reader/library/navigation/edition/mode-switch/preview/iPad/cloud flows now take that extra contents step while retaining every saved-position, independent-mode and source assertion. `polish-flow.js` additionally requires one action per card and contents-only primary URLs.

- Scope: reader UI, `public/styles.css`, ruby renderer, shared navigation and mode entry cards.
- Reproduction: A broad `.resume-panel span` rule overrides the spans inside phonetic markup, scattering the annotation vertically; every disabled answer inherits opacity .4, including the correct answer. Cover links and buttons have different box models, and the last comprehension scene labels a no-op as the next story.
- Fix: scope metadata styles to direct children; replace custom phonetic-span layout with the pinned Han.css 3.3.0 Zhuyin component and bundled font (MIT, self-hosted). Only an isolated ruby wrapper/white-space adapter remains. Answer locking keeps full opacity and a textual correct-answer marker. Cover primary/secondary actions share dimensions, own-mode contents are directly reachable, and the final scene returns to its contents.
- User-approved updates, 2026-10-17: remove visible production statements; polish cover, navigation, contents and question hierarchy; add direct own-mode contents in the fixed header. Keep episode-cover mode switching and independent saved positions. Formatting work must research appropriate packages/standards first; decision record is `storybooks/super-ya-novel/docs/UI-DEPENDENCIES.md`.
- Regression: `polish-flow.js` reproduces the collapsed cover action and scattered resume annotations before fixes, then covers matching action dimensions, real glyph bounds, answer contrast, own-mode TOCs and the last-unit destination. `zhuyin-flow.js` measures actual glyph Range bounds for vertical alignment across both readers and cover/contents at multiple sizes. `ipad-flow.js` adds WebKit touch/HiDPI portrait/landscape interactions and screenshots. These are browser simulations, not physical iPad Safari verification. Existing source, anchor, settings, parent gate and cloud durability flows remain required.

## REG-056 — Duplicate drawer contents collapse into narrow vertical columns

- User-approved behavior update, 2026-10-17: remove the entire duplicate reading-tools area (progress card, mode marker and contents), retaining only settings and the parent gate. The fixed header already provides own-mode contents. This supersedes the historical drawer-flow expectation that the drawer contain navigation and progress; all setting persistence, backdrop, size and parent checks remain.
- Fix: stop generating the duplicate content in either mode or the shelf. Use one reading-settings heading. On natural speech completion remove the status bubble instead of announcing completion; clear stale speech status when cancelling or starting another utterance.
- Regression: `settings-trim-flow.js` reproduces the duplicate section before the fix, checks both readers at 333px, retained settings/parent entry, active speech stop control, natural completion with no bubble or highlight. Related `drawer-flow.js` and settings flows retain persistence checks.
- Historical test timing correction: `mode-switch-flow.js` now reads article and question rectangles in one browser evaluation. Its original below-article assertion is unchanged; separate asynchronous measurements were comparing two different native smooth-scroll frames.
- Requested navigation migration: `reader-flow.js` and `library-flow.js` select chapters from the fixed header's own-mode contents instead of the removed drawer contents. Original source fidelity, chapter selection, saved maps and reading-anchor assertions stay intact.

## REG-058 — Fourth and fifth exercise positions cannot reach cloud storage

- Scope: `storybooks/super-ya-novel/worker/progress.mjs`, approved three-book publication and phonetic data.
- Reproduction: the UI accepts variable question counts, but saving `positions.s4:story=4` or completed position 5 is rejected because practice positions were bounded to 3. The old attempt validator already used catalog question counts, so a correct fifth answer could coexist with rejected navigation state.
- Fix: bound current/completed positions by the selected unit's generated question count, retaining original three-question limits and legacy-extra compatibility. New Node test first fails against the hardcoded bound; `publish-cloud-flow.js` performs the actual fifth-question flow against isolated local D1, then resumes from a fresh browser and reloads its completed state.
- User-authorized update, 2026-10-17: publish all three approved drafts alongside the two originals. Shelf/catalog expectations change from 2 to 5 books and parent rows from 14 to 36. Original Kiki/SUPER YA identities, source paragraphs, all 42 original questions and historical cloud recovery assertions remain intact; new books add 85 questions with independent progress keys.
- Phonetic correction: the historical `擅長` fixture incorrectly expected ㄓㄤˇ. The user's Taiwan-Bopomofo requirement is implemented with ㄔㄤˊ per the Ministry of Education Concised Dictionary, https://dict.concised.moe.edu.tw/dictView.jsp?ID=34555&la=0&powerMode=0 . Sentence-level overrides additionally cover 園長、答應、倒地、空手道、背包、當成、捨不得. `published-episodes.test.mjs` checks every occurrence in the delivered annotation dictionary, not just one example. The older expectation is corrected to the source-backed pronunciation rather than dropping the assertion.

## REG-059 — Reading settings exclude playback actions

- User-approved behavior update, 2026-10-17: remove full-text speech and stop buttons from both reading-settings panels. Preserve speech speed, paragraph/word speech, and the active playback stop control outside settings.
- The existing `settings-trim-flow.js` gained two assertions per mode and failed against the old panels before the change. It now checks removed controls and retained speech speeds alongside all prior completion/stop/parent checks (18 checks). `drawer-flow.js` retains shared-setting persistence and portrait/landscape checks (11).

## REG-060 — Completed exercise button hides Chinese text until hover

- Scope: `storybooks/super-ya-novel/public/styles.css`, completion actions in `practice.js`.

- Reproduction: Finish or skip the three questions in a Kiki unit. The green next-unit button shows phonetics but its Chinese label blends into the background until the mouse hovers.
- Root cause: `.practice-panel > button` overrides `.primary` with dark green text. The more specific `.primary:hover` restores white only while hovering. Measured normal Chinese contrast was 1.02:1 while annotation contrast was 6.92:1.
- Fix: scope the explicit white foreground and green border to `.practice-panel > button.primary`, retaining existing Han.css annotation rendering. Normal Chinese contrast is now 7.40:1.
- Regression: `tests/primary-label-flow.js` follows an actual completed unit, tests normal/hover/focus contrast for Chinese and phonetics, and opens the next unit. It failed before the fix. `ipad-flow.js` also checks the white Chinese label in touch mode without hover. Existing cover/navigation/preview/source and reading-anchor flows remain required.

### 2026-10-20 authorized SUPER YA edition replacement

The user requested completing all SUPER YA event reflections and replacing the first SUPER YA on the formal shelf. The active edition now has forty pieces, including the unchanged five approved trial pieces. The duplicate shelf card is hidden; all original sources, comprehension data and cloud documents remain retained. Old five/seven-part completion must not count as reading the new forty-part text. A separate `super-ya-events:whisper` document stores the new progress, and parent mode distinguishes old records. Old seven-part whisper links return to current contents instead of assigning an unrelated chapter number. Comprehension deep links remain usable.

`tests/library-flow.js` and `tests/production-flow.js` now expect four visible shelf cards, as explicitly requested. `tests/reader-flow.js` retains every historical five-document source, image, map, anchor and migration assertion against the archived edition via a local catalog fixture; it no longer asserts that the replaced prose is the active child entry. `tests/events-edition-flow.js` checks the real current root entry, all forty manuscripts, settings, parent gate, legacy isolation and old links. `tests/events-cloud-flow.js` checks actual isolated local D1 writes and fresh-browser resume at piece forty, with unchanged old document revision/time/state. No production-child writes occur during verification.

## REG-061 — Two-digit chapter numbers gain an extra zero

Test-harness correction during this release: tracing the fifth-question test showed that its async `waitForFunction` predicate could finish while a promise resolved false, before the position had reached D1. The resume assertion itself was correct and remains unchanged. `publish-cloud-flow.js` now polls the actual local API until the required position/answer is present and prepares its interrupted local fixture's starting position. All seven checks pass, including fresh-browser resume and completion. `events-cloud-flow.js` uses the same explicit API polling. No product behavior was changed to accommodate the test.

- Scope: `storybooks/super-ya-novel/public/app.js`, whisper contents.
- Trigger: expanding beyond nine pieces exposes the existing `0${i+1}` formatter, yielding 010, 011, etc.
- Fix: reuse the reader heading's native `String(i+1).padStart(2,'0')`; no layout or phonetic dependency change.
- Regression: `tests/events-edition-flow.js` opens the real forty-piece contents and verifies 10 and 40, full source rendering, and large annotated layouts at 820×1180, 1180×820 and 390×844. `tests/events-edition.test.mjs` verifies stable IDs, approved opening and cloud bounds.

## REG-062 — iOS playback failures enter an unbounded reload loop and appear recovered

- Problem: An iPad repeatedly fails to start a listening episode while Mac/Tailscale probes are healthy. Production captured 23 retries in 3.772 seconds at position zero; background episode changes can also remain at zero until the page becomes visible.
- Reproduction: Open a listening episode whose metadata loads but playback fails, allow automatic retries, and observe the retry deadline and media-element identity. Separately reject `play()` with `NotAllowedError` and inspect the child controls and diagnostic export.
- Correct behavior: An automatic recovery cycle has one 60-second deadline and reuses the native media element. For an existing play request, recovery requires real timeline advancement; metadata alone cannot reset the deadline. A never-started paused item may finish preparation at `canplay`. Expiry requires an explicit new retry. `play()` permission/format rejections retain their original names and are not treated as transient Mac connection failures. Diagnostics preserve visibility, source kind, buffer state, system media actions and episode transitions, and only label a modern session recovered after recovery evidence following its last error.
- Root cause: `loadedmetadata` invoked the retry-success callback, clearing the deadline before playback started. The subsequent rejection began another cycle and changed the component key, repeatedly destroying the iOS media session. The play rejection discarded the original exception; diagnostic ingestion marked any session with an error as recovered even when playback never advanced.
- Regression tests: `e2e/regressions/media-auto-retry.spec.ts` (fixed budget, same element, manual retry and permission denial), `e2e/features/playback-diagnostics.spec.ts`, `e2e/regressions/youtube-listen-continuation.spec.ts` (actual autoplay-blocked event and resume) and `test/diagnostics.spec.ts` (sanitized evidence and recovery ordering). Existing native-loop and lock-screen flows remain in `e2e/regressions/listen-background-audio.spec.ts`.

## REG-063 — Lock-screen resume discards buffered audio and stalls in the background

- Problem: Self-hosted pure listening pauses correctly on an iPad, but pressing Play while still locked leaves it silent, with the system playback timeline appearing to run.
- Reproduction: Start a self-hosted item in pure listening, lock the screen, pause from the system media controls, then press Play without unlocking. Repeat the pause/resume sequence.
- Correct behavior: Resume the same loaded audio element at the paused position without reloading its source or clearing buffered data while hidden. An explicit pause must remain paused when the screen is unlocked. Preserve the separate foreground repair from REG-027.
- Root cause: REG-027's unconditional source rebind called `load()` on every system resume. Production session `e29a8194-96b4-4dc0-87eb-eef7a3056d33` on 2026-10-22 showed 684 seconds buffered before resume, then zero buffered and a pending play at metadata-only readiness after the background reload. The new test replays this load-stall failure; it cannot assert audible output on a physical iPad. The separate report of sound continuing after swiping away the PWA remains unconfirmed at the native-process level.
- Regression test: `e2e/regressions/lock-screen-resume-buffer.spec.ts` exercises initial playback, locking, two system pause/resume cycles, position advancement, unchanged source/element/load count, and unlocking while paused. Existing REG-027 assertions remain unchanged.
- Related readiness fix: late metadata must not replace a real `PLAYING` state with `READY`; the unchanged `REG-001` playback-position flow protects continued advancement across access refreshes. The deterministic media helper isolates its synthetic failures from Chromium's unrelated errors on aborted dummy WAV requests; the independent downloaded-media flow still exercises actual audio playback.
