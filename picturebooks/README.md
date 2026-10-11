# 和妳一起讀

正式網址：[和妳一起讀](https://mother-daughter-picturebooks.ji3cp31p4.workers.dev)。2026-10-11 首次發布 7 本、100 頁，已逐一驗證全部 107 個圖片／封面檔案及正式閱讀流程。

媽媽與女兒在 iPad 上一起閱讀的獨立繪本網站。純圖片、手動翻頁、網址直接開啟；不需要帳號。首頁採奶油紙色、杏桃與鼠尾草綠，使用既有母女插畫。橫放優先，直放保留完整圖片；箭頭在圖片外，專心閱讀模式隱藏控制列。進度存在裝置的 localStorage，不跨裝置同步。

## 本機預覽與驗證

沿用上層專案已安裝的 Node、Wrangler、FFmpeg 與 Playwright，無需另外安裝套件。在本目錄執行：

```powershell
node scripts/preview.mjs
```

開啟 `http://127.0.0.1:5186`。圖片尚未匯入時，先依下節產生本機圖片。測試：

```powershell
node --test test/*.test.mjs
..\node_modules\.bin\playwright.cmd test --config playwright.config.ts
node scripts/verify-site.mjs
```

Playwright 驗證 Chromium 與 WebKit 的 iPad 橫放／直放視窗，包括選書、翻頁、保存進度、重新整理、專心閱讀、手動結束、搜尋、網路重試及儲存失效。觸控事件以合成事件驗證；瀏覽器模擬不能取代真實 iPad 的手勢、Safari 工具列與主畫面啟動檢查。

## 新增繪本與發布

來源每本一個資料夾，名稱為 `01_Book_Title`；圖片使用從 1 起連續、不重複的頁碼，例如 `01.png` 或 `01_說明.png`。支援 PNG、JPEG、WebP，忽略 CSV 等非圖片；頁數不限 10–20 頁。圖片內保留原有文字。

```powershell
node scripts/import-books.mjs 'C:\Users\ji3cp\OneDrive - Foxconn\01_Home\32_上傳文章\兒歌'
```

工具只讀取來源，依數字頁序檢查缺頁，產生最大寬度 1800px 的 WebP 與 800px 封面；不放大較小來源。產物包含 `public/catalog.json` 與被 Git 忽略的 `public/media/books/`。完整圖檔放入 R2，網站發布只包含程式與目錄。

圖片路徑包含來源與轉換設定的 hash；更新圖片產生新路徑，避免長效快取顯示舊圖。舊 R2 圖片保留以利回復。匯入會重建目錄，應確認來源包含所有要上架的書。

認證先依 [Cloudflare SOP](../docs/cloudflare-access-sop.md) 檢查。首次已建立專用桶 `mother-daughter-picturebooks-assets`；不要重複建立，勿使用影片網站的桶或 D1。先上傳、驗證成功，再發布目錄：

```powershell
node scripts/upload-images.mjs
..\node_modules\.bin\wrangler.cmd deploy --config wrangler.jsonc --dry-run
..\node_modules\.bin\wrangler.cmd deploy --config wrangler.jsonc
```

上傳工具每次三張並行，失敗重試三次；已完成路徑記錄在被 Git 忽略的 `.wrangler/image-uploads.json`，中斷後可重跑。上傳仍失败時不要部署目錄。圖片 hash 不變時跳過已記錄上傳，若遠端檔案曾被人工刪除，需清除對應完成紀錄重新上傳。

Worker 為 `mother-daughter-picturebooks`。必須使用本目錄的明確 `--config`，避免部署到上層影片網站。圖片透過 `/media/books/...webp` 由 R2 與邊緣快取提供，bucket 不開啟 `r2.dev` 公開網址。網站本身公開，知道網址的人可以閱讀。

發布後執行 `node scripts/verify-site.mjs <正式網址>`，逐一驗證目錄引用的圖片與 WebP 檔頭，並跑閱讀流程與擷取 iPad 截圖。匯入輸出、圖片與截圖保留在本機；原始素材保留於 OneDrive。

## 加入 iPad 主畫面

以 Safari 開啟正式網址，點「分享」→「加入主畫面」。主畫面名稱為「一起讀」。需要網路，手動翻頁。Safari 清除網站資料會移除閱讀進度、指南收藏與設定。

## 媽媽陪讀指南

閱讀器點「媽媽陪讀指南」，預習目前頁面與其他頁；「回到繪本」留在進入時的閱讀頁。指南提供原文與翻譯、情境解釋、畫面觀察、簡單英文延伸、問答／孩子可能回答／媽媽接話、生活連結與想像小遊戲。2026-10-11 已以目前上架的 7 本、100 張圖片逐頁核對；沒有匯入來源資料夾的新書。原文空白頁明確註明無故事英文；掛鉤、成對眼鏡、同頁多動作與未寫明的角色關係均按圖片處理，推測與遊戲不當成原文。

深綠英文整句可點，使用 `speechSynthesis`；每次取得裝置聲音，優先 en-US，其次其他英文聲音，沒有合適聲音時交由裝置按 en-US 語言選擇。沒有音檔、外部 TTS 或錄音上傳。正常 1、慢速 0.6（舊的 0.8 慢速設定會自動轉換），一次一句，換句、換頁、離開及切背景會取消前句。實際聲音依 iPad 設定；瀏覽器模擬驗證呼叫及狀態，仍需在真實 iPad 試聽。

愛心收藏、語速與每頁捲動位置使用獨立 localStorage `mother-daughter-guide:v1`；「只看收藏」篩選目前指南頁，仍可用指南箭頭看其他頁的收藏。全部／收藏分別保存位置，不跨裝置同步。指南缺少、資料不符或網路失敗時可重試，繪本仍可閱讀。

每本資料是 `public/guides/<book-id>.json`，格式為 `{version:1,bookId,title,pages:[{page,image,sections:[{title,note?,phrases:[{id,en,zh,label?}]}]}]}`，page 從 1 開始、image 必須與目錄對應。新增書籍可沿用格式，不需要改前端。作者資料在 `content/001.mjs` 至 `007.mjs`，執行 `node scripts/build-guides.mjs` 重新產生；句子 ID 包含書頁與英文內容 hash，修改英文時不會把舊收藏默默換成另一句。生成工具只寫指南，不匯入或上架新書；未準備作者資料的新書需先新增對應模組。

指南測試涵蓋全部上架書籍對應、獨立預習與返回、收藏、捲動、壞資料與網路重試、語速／播放切換／背景取消／錯誤重試。內容測試驗證全部頁碼、圖片、翻譯、對話角色、想像標示與句子 ID。

## 資料介面

`catalog.json` 提供 `{ version: 1, books: [...] }`；每本包含穩定 `id`、數字 `number`、`title`、`cover` URL 與依序排列的 `pages` URL。前端使用 `#book/<id>?page=<1-based-page>`，翻頁以 replaceState 更新 URL，避免返回鍵逐頁倒退；重新整理保持頁碼。書櫃與閱讀器共用同一套介面，可擴充至 101 本。
