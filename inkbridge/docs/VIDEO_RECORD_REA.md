# 影片紀錄（高亮）第一階段：REA 筆記（進行中，尚未實作）

2026-11-12。分支 `claude/inkbridge-video-record`（基線 `ee578ab`），工作樹 `.worktrees/board-search`。
本檔只記錄已從原版程式確認的事實與待查項目；產品碼尚未修改。

## 使用者確認的規格

- 來源：本地影片（只記路徑，找不到可重新指定，筆記仍可開）、YouTube（第三階段）、百度網盤（僅留 UI）。
- 影片卡片工具列直接顯示「紀錄」按鈕（不收進「…」），取代「在新分頁開啟」；
  移除「側邊欄／彈層／浮窗」三個開啟方式。
- 「紀錄」開新分頁，右側預設高亮；字幕保留。
- 控制列：−5s、−1s、播放／暫停、+1s、+5s 同時顯示；播放與暫停時都能添加標記；每次自動截圖。
- 標記時間改為按下當下直接讀取影片時間（使用者同意修改原版行為）。
- 不做「改時間」；保留刪除、點標記跳轉。
- ±1s、觀看紀錄模式、拖曳到白板為依使用者規格的新設計（使用者已同意）。
- 第二階段：觀看紀錄模式、放到白板、側欄 00:00 修正、拖曳。第三階段：YouTube、設定頁。

## 原版模組（已確認）

| 模組 | 內容 |
|---|---|
| 81072 | `/video` 專頁 default。讀 `videoCardId`/`timeStamp`，`getMediaCardById`，掛 `80716.ZX`；mount 時 `22676.lx({view:VU.videoSubtitles})`，unmount 回 `VU.list`。這就是預設開字幕的原因。容器 class `video-page-container`。 |
| 80716 | `ZX` 播放器外層與影片卡片工具列（Open in new tab → `/video?fileId=&videoCardId=`、Open in Sidebar → `22676.TV({view:XM.media})`、Screenshot）。 |
| 59771 | `i` 實際播放器（video.js）。本地：`src = 94700.pC(fileId + '.' + ext)` → `flexnote://file/<fileId>.<ext>`；YouTube 用 iframe + postMessage `__ytShim` progress；另有 baidudisk／quark／aliyundrive 分支。 |
| 79719 | 高亮面板（export `uL`）。添加標記 `ej`：先暫停，`19281.YH.newVideoHighlight(C, fileId, screenshotFileId, '')` → `addVideoHighlight`。快捷鍵 space、left/right（±5s）、`m`、Ctrl+Enter。自動截圖開關 `localStorage.videoHighlight_autoScreenshot`。 |
| 41 | 右側欄 `n`（InkBridge 已掛載）。`currentSidebarView===VU.videoHighlight` → `79719.uL{fileId,videoId,showVideo:false}`；`VU.videoSubtitles` → 字幕。 |
| 95823 | 字幕面板（含百度相關）。 |
| 6104 | redux `video.videoHighlights`。 |
| 45023 | 截圖／封面輔助，`saveVideoScreenshot({base64Image,fileName,currentTime})` 回傳 `{fileId}`。 |
| 19281 | `newMediaCard{title,fileId,type,fileSuffix,link,platform,path,cover}`、`newMediaCardInstance`（預設 700×400）、`mediaCardInstanceToMediaCardNode`、`newVideoHighlight{sourceId,timeStamp,notes,color,screenshotFileId,text}`。 |
| 31167 | 建立選單含 `newVideoCard`；實際開啟的對話框與選檔方式尚未追到。 |

## 00:00 成因

79719 的目前時間 `C` 只由兩處更新：每 1 秒讀 `eh.currentTime`，以及 `51245.Qw` 事件。
`eh` 在專頁模式由面板主動查 `.video-page-container video` 綁定；`showVideo`（側欄內嵌）模式
該段明確 `return`，只靠內嵌播放器的 `onLocalVideoLoad` 回呼。未綁定時 `C` 為 undefined，
按鈕顯示 `--:--`，標記存成 0。內嵌播放器對本地影片為何未回呼仍待實機確認。
另：每秒輪詢使標記最多慢 1 秒。

## 截圖按鈕

擷取目前畫面 → `saveVideoScreenshot` → `copyImageToClipboard`。不產生高亮。

## 拖曳

79719 內沒有任何 drag 相關程式；拖到白板是新設計。

## InkBridge 現況與接法（依現有 PDF 模式）

- 服務入口 `globalThis.__inkbridgeServices`（`original-shell.mjs`），各領域為 `{has,call}`，
  範本 `src/core/original-pdf.mjs`；路由 `router.push` 目前只接 `/pdf`、`/note-detail` 等，
  專頁以 `state.page` 切換並在 `ShellPortals` 掛 `r(<page>).default`。
- 缺少的服務：`getMediaCardById`（目前僅 image）、`updateMediaCard`、`updateVideoCover`、
  `getVideoMetadata`、`addVideoHighlight`、`updateVideoHighlight`、`getVideoHighlightsBySourceId`、
  `batchDeleteCardsByType`（VideoHighlight）、`saveVideoScreenshot`、`copyImageToClipboard`。
- `addMediaCard`／`addMediaCardInstance` 目前寫死 `kind:'image'`（`original-note-writes.mjs`），
  `toLocalNode`（`board.mjs`）也把 MediaCard 當 image，需區分 video。
- 資料庫 `putCatalog` 的 kind 白名單沒有影片高亮，需要新增（含 deleteCatalog）並讓 load 輸出。
- 檔案通道：`flexnote://file/` 由 `attachment-store.locate` 處理，只接受 64 位十六進位 ID 與
  圖片／PDF 副檔名；路徑連結的影片需要另一條解析（只允許已登記於影片卡片的路徑，支援 Range）。
- CSP 沒有 `media-src`，會退回 `default-src 'self'`，`flexnote:` 影片會被擋，需加入。
- 外網：`webRequest.onBeforeRequest` 只放行本機 origin 與 `flexnote://`；YouTube 屬第三階段。
- 快照只打包 `graph.files` 的附件；路徑連結的影片不會進快照（符合只記路徑的決定）。

## 尚未查的項目

- 31167 `newVideoCard` 開啟的對話框與本地選檔流程。
- 白板上影片卡片的工具列是哪個模組（使用者截圖中的列），以及三個開啟方式的選單來源。
- 79719 控制列按鈕的 JSX 位置（加 ±1s）與 `eC` 截圖實作。
- 10764 如何在畫布上呈現影片 MediaCard 節點。

## 實作進度（2026-11-13，WIP，尚未完成驗收）

已實作並以臨時探測腳本在真實 Electron 看過一次（不是維護中的測試）：
- 原版 67569 對話框建立本地影片卡片，只記路徑（`uploadFile` 對影片回傳連結紀錄，不進附件庫）。
- `flexnote://file/<fileId>.<ext>` 由 `src/main/linked-videos.cjs` 依影片卡片登記的路徑供應，CSP 加 `media-src`。
- 白板上原版 47766 覆蓋層播放；`videoToolbarMore` 擴充點改放直接可見的「紀錄」按鈕。
- `/video` 專頁（81072）＋右側高亮面板（79719），預設高亮，可切字幕（顯示「暫無字幕」）。
- 修補 59771（crossorigin，否則截圖畫布被污染）、79719（按下當下讀時間、−5s/−1s/播放/+1s/+5s、Shift+←/→、300ms 綁定）。
- 添加標記：時間 7.36 秒準確寫入，自動截圖存入附件庫，封面自動產生。
- 播放位置記憶存 localStorage（裝置本機，不進資料庫）。

已寫但完全沒測：找不到檔案的提示與「重新指定位置」（`VideoRecordPage`）。

宿主暫行處理、原因未追完：點開影片覆蓋層後原版 store 的 `isInteracting` 卡在 true，
覆蓋層會蓋住自己的按鈕；目前在 mouseup 後清除（`board.mjs`）。

更正：79719 的高亮列有自訂滑鼠拖曳（放到 `.react-flow__pane` 時呼叫 `94700.KT` 加到白板），
先前「原版沒有拖曳」的結論是錯的，第二階段可直接沿用。

尚未做：維護中的測試 `check-video-record.cjs`（含筆記輸入、點標記跳轉、刪除、重啟保留、
檔案遺失與重新指定）、資料層單元測試、相關回歸（check-shell、check-native-pdf、
check-real-image-paste、資料庫測試）、封裝版驗證、正式文件、整合。
