# 巧虎陪你讀

正式書架：https://shimajiro-reading.ji3cp31p4.workers.dev/

每集先進共同封面，再選「閱讀理解」或「時光悄悄話」。固定導覽為「設定／回到書架／回到封面」；閱讀中不跨模式。琪琪完整稿保留不變；理解目前27題，另18題想法短文已封存；SUPER YA保留15題，另10題封存。舊作答與筆記不刪除、不計入目前必做題數。

設定從左抽屜展開，注音、字級、詞語提示與語速共用。設定底部按住「切換父母模式」三秒才顯示紀錄，背景或離頁後重新鎖定。「回孩子模式」恢復原位置。長按避免誤觸，沒有新增帳號或PIN。

## 內容維護

- [介面契約](docs/INTERFACE.md)
- [內容製作、校對與上架流程](docs/AUTHORING.md)
- [交稿模板](docs/submission-template.json)
- 琪琪唯一寫作範本：`content/books/kiki/source.md`
- 琪琪原始逐字稿及事件核對：`content/books/kiki/original.md`、`evidence.json`
- 理解正文、題目、答案依據分為 `practice-passages.json`、`practice-questions.json`、`practice-answers.json`。清單 `practiceSource` 決定 build 來源；沒有此欄的舊作品沿用 `content/practice.json`。
- 舊版短文來源：`content/legacy-practice.json`。不要再用舊 `import-practice.mjs` 製作新集數。
- `npm run build` 自動生成作品篇數、Worker 白名單、版本碼與帶版本的模組引用。父母模式及 `/api/health` 可核對版本。

## 本機驗證

在本目錄執行 `npm run build`、`npm test`。靜態閱讀用 `npm run dev`；完整雲端測試從儲存庫根目錄使用本專案的 Wrangler 設定與獨立本機 D1。現有 Wrangler 需於 dev 指定 `--compatibility-date 2026-09-04`。

`tests/*-flow.js` 使用 Playwright CLI 的 `run-code --filename` 執行。涵蓋 reader、library、settings、settings-entry、shelf-settings、drawer、navigation、mode-switch、learning、shared-settings、cloud-recovery、edition、practice-position、preview。learning／shared-settings／cloud-recovery會寫測試資料，只能對獨立本機 D1 執行。

Node測試會產生不同篇數的測試作品於 `output/drafts/test-different-counts`。以 `READER_DIST` 指向其 dist、`PORT=4179` 啟動 `scripts/serve.mjs` 後執行 preview-flow。此測試作品不加入正式書架；預覽頁的meta標記及獨立儲存前綴確保不存正式孩子紀錄。

介面已用 Chromium 模擬 820×1180、1180×820、390×844 及最大字級。尚未用實體 iPad Safari 驗收。語音使用裝置可用的中文聲音，優先 zh-TW。

正式發布僅使用本目錄 `wrangler.jsonc`，沿用獨立 Worker及D1；不更動影音站。遵循儲存庫 `docs/cloudflare-access-sop.md`，不得將測試資料匯入正式資料庫。
