# 巧虎陪你讀：飛吧！SUPER YA！

[私人閱讀網站](https://shimajiro-super-ya-reading.fxn-e-bg-5664.chatgpt.site)

目前內容是使用者提供的五章 Markdown 全文，取代舊八章版本。五章正文有 642 個段落，連同小標題共 14,881 個中文字；不含注音、標點、英文與章末補充陪聊。保留原稿的第一人稱敘事、對話、提問、粗體及小標題。封面使用使用者提供的巧虎圖片，未修改原圖。

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
- content/story.json：章節、Markdown 區塊、來源雜湊與補充陪聊。文件中的提問保留在正文；原有章末選項功能另以五組補充陪聊保留。
- content/companion.json：五組章末陪聊，共 20 個預寫回應（含「我還沒想好」），孩子可略過。
- content/ui.json：操作文字。
- content/readings-overrides.json：臺灣字音、輕聲及多音字校訂。
- content/reading-fixtures.json：歷史字音測試用詞。即使原稿換版後不再出現該詞，也保留驗證。
- public/：網站程式、樣式與封面圖。

修改原稿後先 import，再 build。build 會以鎖定版本的 pinyin-pro 產生初稿，套用校訂並輸出正文與獨立注音資料。output/annotation-review.txt 是逐字校閱稿，不納入發布。

注音採本調標記，「一」「不」不另標口語變調。校訂參考教育部辭典，例如：[突然](https://dict.revised.moe.edu.tw/dictView.jsp?ID=54030&la=1&powerMode=0)、[可惜](https://dict.concised.moe.edu.tw/dictView.jsp?ID=17998&la=0&powerMode=0)、[心血](https://dict.concised.moe.edu.tw/dictView.jsp?ID=27647&powerMode=1&q=703)、[研究](https://dict.concised.moe.edu.tw/dictView.jsp?ID=41673&la=0&powerMode=0)。新增內容仍須重新校對。

## 閱讀紀錄

章節、捲動位置、選項和閱讀設定只存在目前瀏覽器的 shimajiro-novel:v2，不會上傳。舊八章版的 v1 紀錄保留；第一次讀新版時只沿用注音與字級設定，章節、捲動位置和選項重新開始，避免不同章節邊界造成錯位。

## 驗證

`npm test` 驗證五份原稿的雜湊與逐段還原、圖片、全文注音對齊及語境讀音。啟動本機伺服器後執行維護中的閱讀流程：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=novel open http://127.0.0.1:4178 --headed
npx --yes --package @playwright/cli playwright-cli -s=novel run-code --filename tests/reader-flow.js
```

驗證全文實際渲染、全部 20 個回應、目錄、字級、注音、進度恢復、儲存遭封鎖、版本切換，及 820×1180、1180×820、390×844 三種尺寸。截圖存於 output/playwright/。使用桌面 Chromium 模擬尺寸，未宣稱在實體 iPad Safari 測試。

本書是依動畫發展的非官方延伸閱讀作品，原稿中的補寫情節與對白並非動畫逐字稿。
