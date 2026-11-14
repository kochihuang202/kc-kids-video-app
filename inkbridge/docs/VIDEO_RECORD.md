# 影片紀錄（第一階段）：本地影片卡片與紀錄分頁

2026-11-13，Asia/Taipei。分支 `claude/inkbridge-video-record`，基線 `ee578ab`。
REA 過程與原始碼定位見 [VIDEO_RECORD_REA.md](VIDEO_RECORD_REA.md)。

## 使用方式

- 白板空白處右鍵 →「視頻卡片」，或左側工具列 → 媒體 →「視頻」再點白板放置 → 原版對話框「本地視頻」選檔 → 建立（取消則不留卡片）。影片只記路徑，不複製進
  InkBridge，也不進快照或分享。
- 點播放中的影片卡片會選取它並顯示卡片工具列（原版要拖一下才會選取；使用者要求修正，REG-147）。
- 點影片卡片即在白板上播放；右上角直接有「紀錄」按鈕（不在「…」裡）。原版的側邊欄／彈層／
  浮窗開啟方式不提供。
- 「紀錄」開新分頁（頁籤類型與圖示同原版 `video`）：左邊影片，右邊預設為高亮；左上角可切換「高亮／字幕」，頂部頁籤顯示「高亮」。
- 控制列：−5s、−1s、播放／暫停、+1s、+5s。快捷鍵：空白鍵、←／→（5 秒）、Shift+←／→（1 秒）、
  M 添加標記、Ctrl+Enter 寫完筆記後繼續播放。
- 添加標記：播放中或暫停時都可，取按下當下的影片時間，自動截圖。點標記時間跳回該處。
  筆記用原版編輯器；刪除走原版確認對話框（軟刪除，截圖保留）。
- 另一台電腦路徑不同或檔案搬走：右邊高亮與筆記照常可看，左邊顯示「在這台電腦找不到影片檔案」
  與「重新指定位置」，選到檔案後即可播放，原有高亮全部保留。

## 來源與接合

| 原版 | 用途 | 修改 |
|---|---|---|
| 31167 / 67569 | 建立選單與「視頻卡片」對話框 | 無；宿主不再隱藏 `newVideoCard` |
| 10764 → 47766 / 41297 / 59771 | 白板上的影片覆蓋層與 video.js 播放器 | 59771：加 `crossorigin`（見下） |
| 81072 | `/video` 影片專頁 | 無；由宿主路由掛載 |
| 79719 | 高亮面板 | 標記時間、控制列、播放器綁定（見下） |
| 6104 / 19281 | 高亮狀態與資料工廠 | 無 |

修補集中在 `scripts/original-reuse/apply-video-record-patches.cjs`，由 `apply-integration-patches.cjs`
呼叫，可重複套用並檢查語法：

- **59771**：本地影片以 CORS 方式載入。否則畫面擷取的 canvas 被污染，截圖與封面全部失敗。
- **79719 標記時間**（使用者同意）：原版用每秒輪詢一次的值，最多慢 1 秒；且播放器要掛載 2 秒後才綁定，
  未綁定時存成 0（即先前觀察到的 00:00）。改為按下當下解析播放器並讀取其時間，綁定延遲改 300ms。
- **79719 控制列**（使用者同意的新設計）：加入 ±1s 按鈕與 Shift+←／→。

宿主程式：

- `src/core/original-video.mjs`：高亮新增／更新／軟刪除、影片卡片更新、截圖存檔、複製圖片、
  播放位置（localStorage，裝置本機，不進資料庫）。
- `src/main/linked-videos.cjs`：`flexnote://file/<id>.<ext>` 只供應已登記在影片卡片上的路徑，
  支援 Range、`no-store`。連結 ID 由路徑雜湊產生；重新指定時 ID 隨之改變，高亮在同一個 commit 內跟著搬。
- `src/main/database.cjs`：內容種類加 `video`、目錄加 `video-highlight`（含驗證）。
- `original-note-writes.mjs`：原版先送卡片實例再送卡片，實例暫存到卡片寫入後再提交。
- `original-shell.mjs` / `board.mjs`：`/video` 路由、紀錄分頁、預設高亮、檔案遺失提示、「紀錄」按鈕
  （原版 47766 的 `videoToolbarMore` 擴充點）、頂部頁籤在紀錄分頁顯示「高亮」。
- CSP 加 `media-src`；右側欄 z-index 由 60 改 40，使原版對話框（z-50）不被側欄蓋住。

## 宿主暫行處理（原因未追完）

點開影片覆蓋層後，原版 Canvas store 的 `isInteracting` 在本宿主會停在 true，覆蓋層的保護層會蓋住
自己的按鈕。目前在所有滑鼠鍵放開、且覆蓋層開啟時清除此旗標（`board.mjs`）。原版在自己的環境為何
不會卡住尚未查明。

## 驗證（真實 Electron、合成資料）

- `node scripts/original-reuse/check-video-record.cjs`（需 PATH 有 ffmpeg 產生 30 秒測試影片）通過：
  原版對話框建立、只記路徑且附件庫為空、白板播放、紀錄分頁與版面、高亮／字幕切換、頂部頁籤為「高亮」、
  ±1／±5 秒（暫停與播放中）、暫停與播放中標記時間精確、截圖為實際 PNG、原版筆記編輯並入庫、
  點時間跳轉、刪除與確認、正常關閉重開完全一致、檔案搬走後筆記仍可看、重新指定後可播放且高亮保留、無頁面錯誤。
- `node scripts/original-reuse/check-video-toolbar-insert.cjs`：左側工具列放置後開出原版對話框，取消不留卡片，建立後入庫並可播放（REG-143）。
- `node --test tests/video-record.test.cjs`：資料庫驗證／整批拒絕／軟刪除／重開；路徑供應範圍、Range、重新指定。
- 相關既有回歸通過：資料庫／持久化／附件／目錄／視窗同步單元測試 36 項；`check-shell`、
  `check-native-resize-lod`、`check-real-image-paste`、`check-native-pdf`、`check-board-search`、
  `check-card-toolbar-menu`。
- `check-native-library-attachments`、`check-native-sidebar`、`check-library`、`check-compact-shell`
  失敗，但在未含本次修改的整合分支 `ee578ab` 上以相同方式失敗（找不到 `#open-trash`、示範白板、
  側欄可見性），屬既有過期測試，不是本次造成；本次未修正。

未驗證：封裝版、YouTube（第三階段）、實體輸入法、長影片與大檔效能、深色主題。

## 第二階段：白板旁高亮、拖到白板、高亮總覽（2026-11-13）

使用方式：

- 白板右上「高亮」頁籤：原版高亮清單（41.iM → tU），點影片進入原版影片視圖（nA：嵌入播放器＋79719 高亮面板，
  含原版專注模式 ↗、返回鍵）。再按一次「高亮」收起面板；按「白板」回到大綱。
- 在面板按「添加標記」：嵌入播放器原本只顯示封面、沒有 <video>，原版因此存成 00:00。現在先啟動播放器、
  等載入後讀取準確時間；無法載入的本地影片不新增標記。
- 拖曳：每列標題的「⠿」把手拖到白板，產生原版高亮卡片（VideoHighlight 節點）。卡片是同一筆高亮的位置，
  不是複本；筆記在任一處修改，另一處同步。已在白板上的列，把手換成原版「◎ 定位」。
- 卡片標題列右側三個原版圖示：📍 在右側面板開啟來源影片並跳到該時間、焦點與捲動到該列；▭ 在側欄開高亮；ⓘ 資訊。
- 從白板移除卡片（Delete、選單「從此白板移除」）只刪位置，高亮保留，可 Ctrl+Z 復原；刪除高亮則其卡片離開白板
  （位置紀錄保留，高亮還原時回來）。
- 左側工具列的媒體按鈕（圖片／視頻／音頻）已啟用：圖片、視頻接上原版對話框；音頻尚未移植，選項保留但停用。
- 影片封面：建立卡片時自動截影片長度 10% 處的畫面（原版截第 0 秒，片頭若是白畫面封面就是白的）。截圖用另一個隱藏的
  影片元素，不會拉動正在看的影片；取不到長度、載入失敗或 8 秒逾時則退回原版截目前畫面。要換封面：紀錄分頁「字幕」→
  「將當前幀設為封面」（原版功能）。
- 白板右下角 ⚙（系統設置）已開放，但只接上「顯示圖片和視頻檔名」，打開後卡片上方顯示檔名，重開仍保留；其他設定項目
  保留畫面但停用，之後逐項驗證再開。
- 左側欄「高亮」：原版高亮總覽頁（63526），點影片進入紀錄分頁。PDF／音頻／筆記高亮尚未移植，原版對沒有資料的
  分區本來就不顯示；「上傳音訊」按鈕保留但停用。

來源與接合：

| 原版 | 用途 | 修改 |
|---|---|---|
| 41.iM / tU / nA | 白板右側面板的高亮清單與影片視圖 | 無；宿主開放「高亮」頁籤並以 `yn` 切換 |
| 79719 | 嵌入播放器的標記、指定時間開啟 | 標記前啟動播放器；帶時間開啟時跳到該時間並聚焦該列 |
| 84539 | 「在側欄開啟」判斷是否在白板 | 改問宿主（原本讀 window.location，宿主網址沒有 /flow，📍 因此失效） |
| 94700.KT / 44321 / 10764 | 拖曳放置、卡片選單、卡片繪製 | 無 |
| 63526 | 高亮總覽頁 | 無；宿主路由 `/highlight` |

宿主：`original-video.mjs` 加入 `addVideoHighlightInstance`、`batchCreate/Update/DeleteVideoHighlightInstances`、
`getVideoHighlight`、`getVideoList`，載入白板時建立卡片節點；`database.cjs` 新增目錄種類
`video-highlight-instance`（驗證高亮與白板存在、座標有限）；復原歷史、剪貼簿實例查詢、多視窗同步皆納入此種類；
`getAudioList`／`getNoteHighlightList` 回傳空清單（尚未移植）。

驗證：`node scripts/original-reuse/check-video-highlight-board.cjs` 通過（右側高亮頁籤、面板標記啟動播放器且時間精確、
拖到白板入庫、卡片帶來源影片、📍 開在高亮時間並聚焦、重開保留、移除卡片保留高亮、Ctrl+Z 復原、刪除高亮卡片離開、
左側總覽頁與停用的上傳音訊、無頁面錯誤）。

未做：高亮的「大截圖觀看模式」（原版沒有，需先討論版面）、YouTube（第三階段）、設定頁（第三階段）、百度網盤。

## 第三階段：YouTube（2026-11-14）

使用者決定：第三階段只做 YouTube 與百度網盤；設定頁照原版（只有「加高亮時自動截圖」），不另加秒數、速度、快捷鍵設定。

原版做法（REA，FlexNote 1.1.70 與擷取的 1.1.69 模組）：
- 「新增影片」視窗的「網絡鏈接」分頁貼上 YouTube 網址，取標題與封面後建立帶 `link` 的影片卡片。
- 播放：主程序開本機播放頁（IPC `get-youtube-shim-origin`，127.0.0.1 隨機埠，`/player?v=&start=&autoplay=`），頁內用 YouTube IFrame Player API；卡片以 postMessage 協定（28931）播放、暫停、跳秒、讀時間。
- 標記截圖：IPC `screenshot-embedded-frame`，主程序找到 YouTube 嵌入 frame，暫時隱藏播放器控制列後 `capturePage`。
- 標題與封面：原版在畫面程序直接呼叫 YouTube Data API，**使用 FlexNote 自己的 API 金鑰**。

InkBridge 實作：
- `src/main/youtube.cjs`：自己寫的播放頁（同一個 postMessage 協定）、`screenshotEmbeddedFrame`（只找 youtube.com／youtube-nocookie.com 的 frame）、`meta`（YouTube 免金鑰的 oEmbed 取標題，下載 maxres／hq 縮圖）。啟動時先開播放頁，頁面安全政策 `frame-src` 只加這個本機位址。
- 網路：`host.cjs` 只額外放行播放頁與 YouTube 播放需要的網域（youtube.com、youtube-nocookie.com、ytimg.com、googlevideo.com、ggpht.com、gstatic.com、jnn-pa.googleapis.com、www.google.com/js/th/），廣告網域維持封鎖。
- `apply-youtube-patches.cjs`（84539）：標題封面改走 `__inkbridgeYoutubeMeta`；封面經原版 `saveVideoScreenshot`（45023 b0）存成工作區檔案，離線也看得到。原版金鑰只留在私有模組，不使用。
- `apply-video-record-patches.cjs`（79719）：第二階段的「沒有 `<video>` 就不加標記」與「📍 等 `<video>` 再跳秒」改成也接受 YouTube 播放器（iframe），用原版 28931 Ym 讀時間／跳秒；並把已套用的舊版插入文字原地升級，避免重複套用。

限制：影片擁有者禁止嵌入的影片（例如部分音樂 MV，YouTube 錯誤碼 150）在 InkBridge 與原版都無法播放。標記若在播放器剛啟動的瞬間按下，時間為 0 且沒有截圖。

驗證：`check-youtube.cjs`（需要網路；YouTube 官方 API 範例影片：取標題封面、封面為工作區檔案、經本機播放頁播放、標記時間 4.9 秒且有畫面截圖、拖到白板後 📍 開在該時間、重開保留）；`tests/youtube.test.cjs`（放行網域、播放頁、oEmbed 與縮圖、ID 驗證）；回歸 `check-video-highlight-board`、`check-video-toolbar-insert`、`check-shell` 通過。

未做：百度網盤（調查中）。
