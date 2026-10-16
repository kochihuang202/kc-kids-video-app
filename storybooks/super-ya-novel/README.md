# 巧虎陪你讀：兩篇故事書架

[Cloudflare 閱讀書架](https://shimajiro-reading.ji3cp31p4.workers.dev/)

Cloudflare 版直接連結：[SUPER YA](https://shimajiro-reading.ji3cp31p4.workers.dev/?book=super-ya)、[琪琪被罵了](https://shimajiro-reading.ji3cp31p4.workers.dev/?book=kiki)。以獨立 Worker `shimajiro-reading` 提供靜態 dist/，不綁定原影片站的 D1、R2 或路由。網址可直接開啟，未加登入；原私人 Sites 保留。不同網域的瀏覽器閱讀紀錄不會自動轉移。

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

## 閱讀紀錄

章節、段落定位、已讀地圖事件與閱讀設定只存在目前瀏覽器的 shimajiro-novel:v2，不會上傳。調整字級、注音與視窗尺寸時，以段落相對工具列的位置保持閱讀定位。五章舊版的章節、字級、注音及像素位置可沿用，接著會改用段落定位；舊選項不再載入。八章版 v1 只沿用字級與注音偏好，避免不同章節邊界造成錯位。儲存被封鎖時仍能讀完全書，地圖在本次開啟期間有效。

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
