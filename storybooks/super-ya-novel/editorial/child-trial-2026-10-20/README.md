# 前五個事件：兒童試讀

這次只完成前五個事件的時光悄悄話，共五篇、正文 1,500 字（與頁尾相同計算法，不含標題、標點、注音及操作文字）。每篇 262～354 字；故事小段與現在巧虎的分享交錯。先交給一年級孩子試讀，再依實際反應修改。

- 兒童正文：`SUPER_YA_前五個事件_孩子試讀版.md`。
- 可獨立校訂的網頁正文與分享範圍：`story.json`。
- 語境注音修正：`readings.json`；逐篇注音校對稿：`annotation-review.txt`。
- 原稿依據、範圍與限制：`review.json`。
- 重建：在專案根目錄執行 `node editorial/child-trial-2026-10-20/prepare-preview.mjs`。輸出只在 `output/drafts/super-ya-first-five-2026-10-20/`；正式原稿、書架、Worker 版本均有雜湊保護。

本機預覽由既有 `scripts/serve.mjs` 服務：`READER_DIST` 指向上述輸出的 `dist`，`PORT=4186`。直接開啟 `http://127.0.0.1:4186/?book=super-ya-revisit&chapter=0&preview=1`。這份試讀未新增理解練習，封面及書架的其他內容沿用原有資料；孩子試讀從以上閱讀網址進入。

預覽沿用現有 Han.css 3.3.0 注音及閱讀介面；未更動排版套件、正式資料或已發布網站。meta preview 與獨立儲存前綴沿用現有隔離流程。字音逐篇檢查；額外修正「車子」的車、「要是」的是、「他得一直」的得，僅作用於這份預覽。

## 獨立線上試讀站

使用者於 2026-10-20 明確要求上線。獨立 Worker 為 `shimajiro-reading-trial`，採 [Cloudflare Workers 靜態資產部署](https://developers.cloudflare.com/workers/static-assets/get-started/)，沿用已安裝的 Wrangler 4.127.1；只上傳隔離預覽的 dist，不綁定 D1、其他 Worker 或正式站資源。

重建完成後，從儲存庫根目錄執行：

```powershell
.\node_modules\.bin\wrangler.cmd deploy --config storybooks/super-ya-novel/editorial/child-trial-2026-10-20/wrangler.trial.jsonc
```

線上入口使用 `/read`，由 Cloudflare `_redirects` 轉到第一篇的預覽網址。讀音、字級及閱讀位置保存在該試讀站的目前瀏覽器，與正式站隔離；不宣稱這個純靜態試讀站有跨裝置雲端同步。發布版本及驗證結果另記於 `deployment.json`。

已上線：[五篇兒童試讀](https://shimajiro-reading-trial.ji3cp31p4.workers.dev/read)。目前發布版本 `4ccc36e7-53e3-47ee-98b1-569e91e3e55d`，內容／介面版號 `0b36ec57c5b2`。

發布後的 `verify-online.mjs <Wrangler Version ID>` 會核對 `/read` 跳轉、52 個資產雜湊、五篇內容、預覽隔離標記與正式站前後版本。正式站維持 `59d4d55982df`。線上桌面操作已確認五篇及目錄、注音開關切頁後重整保留、34px 字級不水平溢出；未做實體 iPad 驗收。上線畫面保存於 `output/playwright/super-ya-trial-online-2026-10-20.png`。

### 同日介面更新

依使用者要求，封面兩張模式卡各只保留一個綠色目錄入口；開始／接著讀留在目錄，原有閱讀位置仍保留。另修復練習完成後主按鈕的中文字被深綠色樣式覆蓋、直到 hover 才出現的問題。

驗證紀錄見 `interface-review.json`：Node 21 項、20 份 Chromium 閱讀流程共 584 個檢查、WebKit 觸控模擬 8 個檢查通過；資料儲存測試只使用 `output/cover-entry-d1` 的獨立本機 D1。未做實體 iPad 測試。正式站資產與資料庫未部署或變更。封面線上畫面保存於 `output/playwright/cover-single-entry-online.png`。

## 2026-10-20 檢查範圍

- 修改前相關 Node 檢查 8 項通過：內容／排版／預覽匯入隔離。
- 建置核對五篇所有漢字均有對齊的注音，正式內容四個受保護檔案均未改動。
- 實際在桌面 in-app browser 開啟五篇，確認段落、分享引用區、下一篇及每篇注音存在，畫面無水平溢出。
- 第一篇三符號注音量測 94 處，上下與國字齊平；放大到 34px 未水平溢出。
- 關閉注音，切到第二篇並重新整理後仍關閉；試讀檢查結束恢復注音開啟、標準字級。
- 本次未做實體 iPad 或孩子接受度測試，未將桌面檢查稱為實機驗收。

孩子試讀時先讓他自己讀，記下他主動停住、問意思、說「我也會」或想跳過的位置。不要一開始就逐句解釋或要求他說出道理，避免成人幫忙掩蓋文章本身的難處。
