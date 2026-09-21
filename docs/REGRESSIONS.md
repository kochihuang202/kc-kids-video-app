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
- Correct behavior: The same native audio media session loops from the beginning and its real current time continues advancing with sound while the screen remains locked.
- Root cause: The React `ended` handler synchronously called `seekTo(0)` and `play()`. Production diagnostics showed iPadOS emitting a new `playing` event within 0.1–0.2 seconds while the underlying timeline remained fixed at either 0 or 902 seconds. Learning audio now uses the media element's native `loop` behavior, so iPadOS performs the transition inside the already-authorized media session.
- Regression test: `e2e/regressions/listen-background-audio.spec.ts`

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
- Correct behavior: The lock-screen controls explicitly pause and resume the app's audio element. Resume rebinds the same source, keeps the previous position, and reattaches the native audio output session before playback continues.
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
