# FlexNote 1.1.70「HTML」分享格式（REA 調查，2026-11-14）

已安裝 FlexNote 1.1.70（`%LOCALAPPDATA%\Programs\flexnote`，2026-11-13 更新）的分享視窗多了「HTML」分頁。InkBridge 目前移植的是 1.1.65／1.1.69 的分享（線上發布、Markdown、圖片、PDF 四個分頁，InkBridge 只開放線上發布），**沒有對齊這個新格式**。以下只記錄調查結果，原版程式未複製進 Git；分析用的暫存解包已刪除。

## 原版做法

- 分頁順序：線上發布、Markdown、PDF、HTML、圖片。HTML 分頁呼叫主程序 `exportWhiteboardHtmlPack`，資料為目前白板與其子白板（`rootId` + `boards`）。
- 檢視器：另一份獨立建置的 `resources/board-viewer/viewer.js`（23.6 MB）與 `viewer.css`（2.8 MB），仍是 CanvasKit 白板。
- 單一白板且沒有內嵌網頁時存成一個 `.html`，以下全部內嵌在同一個檔案：
  - viewer.js／viewer.css 原文；
  - `canvaskit.wasm`（6.8 MB）以 base64 內嵌；
  - 8 個字型全部以 base64 內嵌：Arial、JetBrains Mono ×3、思源黑體 SC（17 MB）、Noto Color Emoji（24 MB）、Noto Sans Math、Noto Sans；
  - 非圖片／影片的附件（例如 PDF）轉成 `data:` base64 內嵌。
- 多張白板或含內嵌網頁時存成 `.zip`：`assets/boot.js`（wasm＋字型）、`assets/viewer.js`、`assets/viewer.css`、每張白板一個 HTML、`html-bundles/…`。
- **圖片與影片**（png、jpg、gif、webp、svg、bmp、mp4、mov、webm、m4v、mkv、avi）：先用 FlexNote 帳號建立一個停用的線上分享，再上傳到 FlexNote 的 S3，HTML 裡改成引用 `https://cdn.myflexnote.com/users/<使用者>/<檔案>`。也就是說，HTML 匯出需要登入 FlexNote，圖片放在 FlexNote 的伺服器上。

## 與 InkBridge 目前線上分享比較

| | FlexNote 1.1.70 HTML | InkBridge 線上分享（自己的 Cloudflare） |
|---|---|---|
| 單一白板的檔案大小 | 約 90 MB 以上（26 MB 檢視器＋約 68 MB base64 的字型與 wasm＋內嵌附件） | 首次約 29 MiB 壓縮傳輸，其中字型約 21 MiB |
| 第二次開啟 | 每個 HTML 都要整份重新讀取與解碼 | 可以靠瀏覽器快取（目前網站設定每次都要重新確認，尚未調整） |
| PDF | 整份 base64 內嵌，開頁前要整份載入 | 翻到哪頁才讀哪一段 |
| 圖片 | 上傳到 FlexNote 雲端，需要 FlexNote 帳號 | 放在自己的 R2，不經過 FlexNote |
| 離線、直接傳檔 | 可以：單一 `.html` 直接雙擊開啟 | 離線網頁包需要 `Start-Web.bat`，不能雙擊 `index.html` |
| 子白板 | 多張白板時變成 zip | 同一個網站，每張白板固定網址 |

結論：單一 HTML 的優點是「能當一個檔案傳給別人、離線雙擊就開」，但它把同樣的字型、wasm 與檢視器全部塞進檔案，**不會比線上分享快**，通常更慢。速度問題的主要原因（大字型與每次重新確認快取）在兩種做法上都存在，應該從字型精簡與快取下手。

若之後要對齊 1.1.70 的 HTML 格式，依 REA 原則應沿用原版 board-viewer 與匯出流程，只把「圖片上傳 FlexNote CDN」這段換成內嵌或自己的網站，並可套用同樣的字型精簡。
