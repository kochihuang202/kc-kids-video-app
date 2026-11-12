# 影片紀錄（第一階段）：本地影片卡片與紀錄分頁

2026-11-13，Asia/Taipei。分支 `claude/inkbridge-video-record`，基線 `ee578ab`。
REA 過程與原始碼定位見 [VIDEO_RECORD_REA.md](VIDEO_RECORD_REA.md)。

## 使用方式

- 白板空白處右鍵 →「視頻卡片」→ 原版對話框「本地視頻」選檔 → 建立。影片只記路徑，不複製進
  InkBridge，也不進快照或分享。
- 點影片卡片即在白板上播放；右上角直接有「紀錄」按鈕（不在「…」裡）。原版的側邊欄／彈層／
  浮窗開啟方式不提供。
- 「紀錄」開新分頁：左邊影片，右邊預設為高亮；左上角可切換「高亮／字幕」，頂部頁籤顯示「高亮」。
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
- `node --test tests/video-record.test.cjs`：資料庫驗證／整批拒絕／軟刪除／重開；路徑供應範圍、Range、重新指定。
- 相關既有回歸通過：資料庫／持久化／附件／目錄／視窗同步單元測試 36 項；`check-shell`、
  `check-native-resize-lod`、`check-real-image-paste`、`check-native-pdf`、`check-board-search`、
  `check-card-toolbar-menu`。
- `check-native-library-attachments`、`check-native-sidebar`、`check-library`、`check-compact-shell`
  失敗，但在未含本次修改的整合分支 `ee578ab` 上以相同方式失敗（找不到 `#open-trash`、示範白板、
  側欄可見性），屬既有過期測試，不是本次造成；本次未修正。

未驗證：封裝版、YouTube（第三階段）、實體輸入法、長影片與大檔效能、深色主題。

## 第二階段備註

原版 79719 的高亮列本身就有滑鼠拖曳：拖到 `.react-flow__pane` 時呼叫 `94700.KT` 放到白板。
先前「原版沒有拖曳」的判斷有誤；第二階段可直接接通，不必新設計。
