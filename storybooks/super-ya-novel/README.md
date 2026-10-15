# 巧虎陪你讀：飛吧！SUPER YA！

給七歲孩子的繁體注音互動小說。八章正文共 5,500 個中文字（不含標點、英文、注音與陪聊）。劇中的巧虎參與冒險，陪讀巧虎在每章末與孩子聊天；八次陪聊共 32 個預寫回應，包含「我還沒想好」。

[開啟私人閱讀網站](https://shimajiro-super-ya-reading.fxn-e-bg-5664.chatgpt.site)。2026-10-15 已發布成功，Sites 原始碼版本為 `8e49babcd8421804d577d7bbaee11ed53e46e27a`。

## 閱讀與本機執行

網站發布為獨立私人 Sites 網站。完整可發布檔案位於 `dist/`；網站不需 API 金鑰、麥克風或應用程式帳號。私人 Sites 的存取層可能需要以擁有者的 ChatGPT 帳號開啟。

```powershell
npm ci
npm run build
npm test
npm run dev
```

開啟 <http://127.0.0.1:4178>。本機版需要透過 HTTP 伺服器閱讀，不能直接雙擊 HTML。可直接以 `node scripts/serve.mjs` 閱讀已附的 `dist/`，無須先安裝套件。

## 編輯內容

- `content/story.json`：八章小說、巧虎提問、三個選項與各自回應，以及暫時沒想法時的回應。
- `content/ui.json`：操作文字。
- `content/readings-overrides.json`：臺灣字音、輕聲與語境讀音校訂。先套用單字規則，再套用詞語規則；長詞優先。
- `public/`：HTML、樣式與瀏覽器程式。原創 SVG 場景由程式繪製，非動畫截圖。
- `scripts/build.mjs`：以鎖定版本的 pinyin-pro 產生初稿後套用校訂，將注音與正文分開輸出。瀏覽器不使用拼音套件或外部字典。

文字變更後重新執行 build。`output/annotation-review.txt` 是全文逐字注音校閱稿，不納入發布。

注音採本調標記，「一」「不」不另標口語變調。臺灣字音的校訂參考教育部辭典，例如：[突然](https://dict.revised.moe.edu.tw/dictView.jsp?ID=54030&la=1&powerMode=0)、[可惜](https://dict.concised.moe.edu.tw/dictView.jsp?ID=17998&la=0&powerMode=0)、[心血](https://dict.concised.moe.edu.tw/dictView.jsp?ID=27647&powerMode=1&q=703)、[熟](https://stroke-order.learningweb.moe.edu.tw/dictMean.jsp?ID=29087&la=0)。仍應在新增內容時重新校對詞義和讀音。

## 閱讀功能

平板直向、橫向與手機皆可用。支援目錄、前後章、三種字級、注音開關及選項切換。聊天可以直接略過，沒有分數或答對提示。

章節、捲動位置、選項及閱讀設定只存在目前瀏覽器的 `shimajiro-novel:v1` 紀錄中，不會傳到伺服器。封面「接著讀」可恢復上次的位置。瀏覽器禁止儲存時仍可讀完全書；清除瀏覽器資料會失去紀錄。

## 驗證

`npm test` 驗證字數、章節及分支完整性、逐字注音對齊，以及語境與臺灣字音。先執行 `npm run dev`，再執行瀏覽器流程：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=novel open http://127.0.0.1:4178 --headed
npx --yes --package @playwright/cli playwright-cli -s=novel run-code --filename tests/reader-flow.js
```

瀏覽器流程在獨立環境中驗證全部八章及 32 個回應、可略過聊天、目錄、字級切換、注音切換、讀取保存位置、儲存封鎖，以及 820×1180、1180×820、390×844 的特大字級版面。結果回傳檢查數與明細；截圖保存在 `output/playwright/`。瀏覽器 QA 使用桌面 Chromium 模擬尺寸，未宣稱已在實體 iPad Safari 測試。

## 故事來源與編寫界線

依使用者提供的 2026-10-15 得到大腦動畫逐字稿改寫。保留花田和解、回程發現修復、最後大人爭吵的順序；不裁定娃娃屋損壞的責任，不命名身分不明的朋友，也不包含預告與購票宣傳。場景感官細節、部分對話及心理描寫為延伸閱讀補寫。這是非官方延伸閱讀作品。
