# 2026-10-16：閱讀理解與完整悄悄話

兩篇每篇各有兩個入口。閱讀理解採用選讀段落、分層提示、原文線索與作答回饋；時光悄悄話保留完整原稿，不被練習摘錄取代。

- 琪琪 45 題由使用者參考 HTML 匯入；SUPER YA 25 題依原稿編寫。58 個人工整理詞條提供臺灣注音、簡明詞義及裝置朗讀。兩模式都可查詞。
- 字體參考原 HTML 的系統黑體、適當字重與段距。固定閱讀設定包含字級、注音、詞語標記、語速、朗讀與停止；段落亦可單獨聽讀。
- 裝置語音優先 zh-TW，再使用可用的中文語音；實際音色、速度、發音取決於裝置，沒有模仿角色聲音。
- 同一孩子共用雲端進度，沒有帳號或身分辨認。家長入口 `?view=parent` 分開顯示閱讀位置、作答、提示、重試、看解說與自由筆記，不把翻頁當成理解。
- D1 `shimajiro-reading-progress` 為獨立資料庫。API 不含登入；知道網址的人可查看或操作這份共用紀錄，適用目前的家庭共用方式。
- 離線時在本機暫存，重新連線再同步；伺服器確認前不刪除待送資料。若連本機儲存也被封鎖，仍可閱讀，離線重開的待送紀錄無法保證留存。沒有下載備份／匯入按鈕。

新增來源與維護：`content/reference/qiqi_reading.html` 是原參考副本，匯入工具只解析資料，不執行其中程式。`content/practice.json`、`content/glossary.json`、`content/learning-ui.json` 與獨立 `readings.json` 可分別校訂。執行 `node scripts/import-practice.mjs` 重建題庫，再執行 build。

本機完整功能需從儲存庫根目錄啟動 Wrangler（純靜態伺服器只供離線閱讀）：

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations apply shimajiro-reading-progress --local --config storybooks/super-ya-novel/wrangler.jsonc
.\node_modules\.bin\wrangler.cmd dev --local --port 4178 --compatibility-date 2026-09-04 --config storybooks/super-ya-novel/wrangler.jsonc
```

本機相容日期覆寫是為現有 Wrangler 4.127.1 的 workerd；正式設定獨立保留。首次正式部署前，先依根目錄 Cloudflare SOP 備份並套用本專案 migrations；切勿把本機測試資料匯入正式資料庫。部署用既有 Worker 設定，無須更動影片站。

新增瀏覽器測試 `tests/learning-flow.js` 與 `tests/cloud-recovery-flow.js` 只能在本機測試資料庫執行，會寫入作答與筆記資料；不要對正式兒童紀錄執行。原 reader/library/settings 流程繼續維護。

---
# 巧虎陪你讀：兩篇故事書架

閱讀時，右下角固定的「閱讀設定」按鈕統一收納字級與注音開關。捲動後按鈕仍在原位；可用「完成設定」、點空白處或 Esc 收起。目錄與回到封面維持導覽功能。

[Cloudflare 閱讀書架](https://shimajiro-reading.ji3cp31p4.workers.dev/)

Cloudflare 版直接連結：[SUPER YA](https://shimajiro-reading.ji3cp31p4.workers.dev/?book=super-ya)、[琪琪被罵了](https://shimajiro-reading.ji3cp31p4.workers.dev/?book=kiki)。以獨立 Worker `shimajiro-reading` 提供網站與進度 API，另建專用 D1；不使用原影片站的 D1、R2 或路由。網址可直接開啟，未加登入；原私人 Sites 保留。不同網域的瀏覽器閱讀紀錄不會自動轉移。

後續部署於儲存庫根目錄執行：`node_modules/.bin/wrangler.cmd deploy --config storybooks/super-ya-novel/wrangler.jsonc`。部署前執行本書 Node 測試及需要的閱讀回歸檢查；先依 docs/cloudflare-access-sop.md 確認既有登入。部署設定參考 [Cloudflare 靜態資產文件](https://developers.cloudflare.com/workers/static-assets/binding/)。

[私人閱讀網站](https://shimajiro-super-ya-reading.fxn-e-bg-5664.chatgpt.site)

2026-10-16：依使用者最後指示，保留原故事並新增第二篇，入口改為兩本書的書架。也能直接連結：

- [飛吧！SUPER YA！](https://shimajiro-super-ya-reading.fxn-e-bg-5664.chatgpt.site/?book=super-ya)：原五章全文、圖片與回想地圖。
- [琪琪被罵了](https://shimajiro-super-ya-reading.fxn-e-bg-5664.chatgpt.site/?book=kiki)：完整八篇情境與尾聲，共 282 個段落，約 1.1 萬中文字。「那一天」保留為故事段落，「巧虎的時光悄悄話」以引用區呈現。保留所有原文及粗體，沒有新增選項陪聊。

兩篇的封面與頁尾都有書架和另一篇的連結。原書沿用 shimajiro-novel:v2，新增書獨立使用 shimajiro-novel:kiki:v1，章節、段落、已讀事件、字級與注音均不互相覆蓋。沒有提供新篇的影片，因此新篇以角色封面和文字閱讀為主，沒有挪用 SUPER YA 的劇情圖片。

新增內容來源保存於 content/books/kiki/source.md，連同位元組雜湊與逐段重組測試。執行 `node scripts/import-kiki.mjs` 可由副本重建；給完整 Markdown 路徑則重新匯入新稿。content/library.json 管理入口及儲存鍵；content/books/kiki/ui.json 為此書的操作文字。原五章的來源、匯入工具與校訂流程仍保留。

原《SUPER YA》內容是使用者提供的五章 Markdown 全文。正文有 642 個段落，連同小標題共 14,881 個中文字，不含注音、標點與英文。保留原稿的第一人稱敘事、對話、提問、粗體及小標題；已移除額外的章末選項陪聊。

陪讀巧虎直接對孩子說話的段落採頭像、細直線與引用排版，搭配少量重點粗體。五章各有不同的動畫開場截圖，內文另有對應情節的畫面。章末可收合的故事地圖只顯示已讀事件，可點圖返回原段落；封面提供「上次讀到這裡」提醒。全文連續閱讀，沒有改成一句一張卡。

## 本機閱讀與建置

已附可直接啟動的 dist/。執行 `node scripts/serve.mjs` 後，開啟 <http://127.0.0.1:4178>；不能直接雙擊 HTML。

```powershell
npm ci
npm run build
npm test
npm run dev
```

瀏覽器端不需 AI、API 金鑰或麥克風。私人 Sites 的存取層可能要求以擁有者的 ChatGPT 帳號開啟。

## 原稿與編輯

- content/source/：五份使用者原始文件的完整副本，保留位元組內容。
- scripts/import-documents.mjs：由這五份文件產生章節，不改寫、不摘要。`node scripts/import-documents.mjs` 可從副本重新匯入；另給資料夾參數則從該資料夾匯入。
- content/story.json：章節、原文 Markdown 區塊與來源雜湊。原稿內的提問全部保留。
- content/presentation.json：逐章人工辨認的陪讀段落範圍、粗體詞句、配圖位置與故事地圖事件。這些設定不改寫原文。
- content/image-sources.json：使用者影片的擷取秒數、頭像裁切範圍與來源說明。
- content/ui.json：操作文字。
- content/readings-overrides.json：臺灣字音、輕聲及多音字校訂。
- content/reading-fixtures.json：歷史字音測試用詞。即使原稿換版後不再出現該詞，也保留驗證。
- public/：網站程式、樣式、原封面、16 張本集截圖與真實巧虎頭像。影片不包含在網站裡。

修改原稿後先 import，再 build。build 會以鎖定版本的 pinyin-pro 產生初稿，套用校訂並輸出正文與獨立注音資料。output/annotation-review.txt 是逐字校閱稿，不納入發布。

重新擷取圖片：`node scripts/extract-stills.mjs <本集影片完整路徑> <ffmpeg執行檔完整路徑>`。圖片維持 16:9，不移除字幕；頭像另行裁切。延伸小說有補寫情節，配圖只呈現相同場景，不宣稱動畫演出了每個補寫細節。封面保持使用者提供的原圖。

注音採本調標記，「一」「不」不另標口語變調。校訂參考教育部辭典，例如：[突然](https://dict.revised.moe.edu.tw/dictView.jsp?ID=54030&la=1&powerMode=0)、[可惜](https://dict.concised.moe.edu.tw/dictView.jsp?ID=17998&la=0&powerMode=0)、[心血](https://dict.concised.moe.edu.tw/dictView.jsp?ID=27647&powerMode=1&q=703)、[研究](https://dict.concised.moe.edu.tw/dictView.jsp?ID=41673&la=0&powerMode=0)。新增內容仍須重新校對。

## 舊版閱讀紀錄（目前另有雲端同步）

舊版章節、段落定位、已讀地圖事件與閱讀設定存在目前瀏覽器；新版以雲端為主，保留本機快取與待同步佇列。調整字級、注音與視窗尺寸時，以段落相對工具列的位置保持閱讀定位。五章舊版的章節、字級、注音及像素位置可沿用，接著會改用段落定位；舊選項不再載入。八章版 v1 只沿用字級與注音偏好，避免不同章節邊界造成錯位。儲存被封鎖時仍能讀完全書，地圖在本次開啟期間有效。

## 驗證

`npm test` 驗證五份原稿的雜湊與逐段還原、圖片、全文注音對齊及語境讀音。啟動本機伺服器後執行維護中的閱讀流程：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=novel open http://127.0.0.1:4178 --headed
npx --yes --package @playwright/cli playwright-cli -s=novel run-code --filename tests/reader-flow.js
npx --yes --package @playwright/cli playwright-cli -s=novel run-code --filename tests/library-flow.js
```

驗證全文實際渲染、陪讀角色區分、不同章節圖片、故事地圖解鎖與回跳、目錄、字級、注音、段落恢復、儲存封鎖、版本切換，及 820×1180、1180×820、390×844 三種尺寸。截圖存於 output/playwright/。使用桌面 Chromium 模擬尺寸，未宣稱在實體 iPad Safari 測試。

本書是依動畫發展的非官方延伸閱讀作品，原稿中的補寫情節與對白並非動畫逐字稿。

新篇注音另校訂「當然得／總得／就得」「教她」「那只花瓶」「著急」等語境；「扎到」與「珍藏」參考教育部辭典：[扎](https://dict.revised.moe.edu.tw/dictView.jsp?ID=7644&la=0&powerMode=0)、[珍藏](https://dict.concised.moe.edu.tw/dictView.jsp?ID=29944&la=0&powerMode=0)。新增字音測試涵蓋這些詞語。

## 2026-10-16：左側工具抽屜與共用設定

使用者要求入口與閱讀內頁都能找到設定，改成左側抽屜，包含進度、章節／情境、切換模式、回書架、家長進度與完整閱讀設定。點背景、關閉、完成或 Esc 可收起；鍵盤 Tab 限於抽屜控制項。

字級、注音、詞語提示與語速現在共用 `reading:settings` 雲端文件，保留本機快取和原有待同步機制。閱讀位置、作答與筆記仍按書籍／模式分開。沒有新增資料表，沒有重設舊紀錄；首次共用偏好沿用目前模式已有的雲端／裝置設定。根書架與家長頁也尊重注音開關。

兩種模式都有相同的切換入口，標示目前所在模式。從內頁切換帶上章節／情境；閱讀理解改為與悄悄話相同寬度、字體及連續單欄故事，理解題在故事後方。完整悄悄話原文不變。
