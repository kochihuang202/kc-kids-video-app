# 獨立唯讀網頁分享（0.5.15）

使用方式：開啟白板，按畫布右上角「匯出唯讀網頁」。完成後按「開啟資料夾」。整個資料夾才是一份分享包；包含選定白板與其所有子白板，未包含其他未連入的工作區內容。此操作不會上傳網站。

本機預覽執行包內 `Start-Web.bat`（需要 Node.js），或用一般靜態 HTTP 伺服器提供整包。網站入口為 `index.html`；瀏覽器觀看不需要 Node.js、Electron、FlexNote 或登入。`file://` 直接開 HTML 不在支援方式內，頁面會說明正確入口。

## 原版確認與採用範圍

先檢查既有 REA，針對已安裝 1.1.69 ASAR 的分享 UI78178、載入67259、`/v/flow` 頁面與主程序 share IPC 追完整資料契約。原版為：初始化白板/筆跡 → `create-share` → 帳號 API → 附件檔案上傳/註冊 → `?shareId=…` 原生唯讀閱讀器。使用者要求不依賴原伺服器，因此只由 InkBridge 的 SQLite/附件邊界替換發布和讀取服務，閱讀器本身沿用完整元件。

目前 InkBridge 完整 1.1.65 registry 已有等效92570父閱讀器、48626白板與67259載入器；保留目前已移植的1.1.69分頁、提示節點與渲染。不把1.1.69整套編輯器重新換入。本輪沒有執行正式 FlexNote 或上傳原服務。

| 完整原模組 | 確認的責任 | 原函式 SHA-256 |
| --- | --- | --- |
| 92570 | 分享父介面、側欄、麵包屑、瀏覽器返回 | `346bdc98968dd0a1b2467a4c7d1f8258f9ba12764cadfcdd5d815ee173590a55` |
| 48626 | 唯讀 Canvas、卡片/PDF/圖片/子白板點擊 | `4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de` |
| 67259 | 完整分享 DTO、附件映射、節點轉換 | `9f846c259d77f3a8abb5d54ad3fcae050768f104f7620d5c62f67208b4bf345f` |
| 53754 | 白板ID/分享ID對照、query路由與歷史 | `7cc97c27a8fc493185b643c45bdc6137fef9ab3a13d91b44c8d4a834ee4463ca` |
| 96895 | 原生 PDF.js 4.4.168 閱讀與翻頁 | `81850a2d1f98fef034dec9f2ffbbeec44abaa89ee11feeb906e47a26b887267a` |

REA保留證據：`ev_aee8649102fe6bc6564884decc35ed79ecb7d76ccf77d9dd475fd4154e07b6c9`、摘要 `ev_db1ff3e1ac832441fe28302cfe3276235ce3b6fa187b647c0f0c02ed9d4039a1`。1.1.69 `/v/flow` JS整檔SHA `4e8bad72f8a8a375dc565b9e628106dca2495c48b427e1920a6853154b6644fc`。以上為靜態程式證據；下列 Chrome/Electron 測試才是 InkBridge 執行證據。私人來源與原 factory 不提交 Git。

## 可維護的接合位置

- `scripts/web-share/prepare.cjs`：校驗現有可編輯原模組及來源身分；產生只供網頁的完整 factory registry，切為最多4MiB的載入檔。沒有替換成另一個白板引擎。桌面 factory 不被這個工具改寫。
- 網頁限定調整：停用帳號位置、觀看統計與 Sentry；本機圖示；保留無縮圖的原生 placeholder；PDF Worker/字型/CSS使用包內相對位置。保留完整原生圖片檢視器。
- **實測發現的唯讀缺口**：原版48626未在刪除回呼檢查唯讀，Undo快捷鍵仍開啟；PDF仍回寫頁數、頁碼/視圖偏好、建立桌面縮圖。只在網頁變體加上原生唯讀/桌面環境條件，不假造SQLite寫入成功。真實Delete測試曾觸發原刪除鏈，修正後不再觸發。
- `src/main/web-share-data.cjs`：選取子白板閉包、循環/重複引用去重；排除回收站、無關卡片、設定與歷史；可見屬性白名單；掃描AST及CAS附件引用。
- `src/main/web-share-export.cjs`：保存ACK後讀取SQLite一致圖，驗證必要CAS檔案大小/SHA-256及路徑；建立獨立暫存目錄，完整產生後原子改名發布。失敗不覆寫先前匯出。舊版純文字沿用現有 `noteDocument` 轉換。匯出包不包含SQLite/Profile/Session。
- `src/web-share/payload.mjs`：自己維護的資料契約轉接，輸出原67259需要的完整DTO及空的未提供關聯集合。
- `src/web-share/viewer.mjs`：包內JSON讀服務、原生providers與閱讀器初始化；不設定假的Electron IPC，也不載入原帳號生命週期。
- 桌面 `inkbridge:web-share`：沿用operation queue、工作區epoch與所有視窗既有flush/Commit ACK；SQLite `load()` 自身使用讀取transaction。讀圖後即使繼續編輯，這份圖保持不變，必要CAS附件也不可變且沒有GC。

## 子白板與 Cloudflare

`shareId` 在包內使用白板ID；原生 `nestedShareMap` 保留完整對照。根→子→孫沿用原版回呼、麵包屑、history/popstate；每層可直接開啟、重新整理和返回。查詢字串路由不需要動態伺服器或每張白板一份HTML。未發布白板會明確拒絕，不回讀桌面/遠端資料。

已用 `/published/demo/` 非根目錄的靜態主機實測，不依賴 `/` 根目錄資源。包內含 `_headers`；來源與網路只允許同站及必要data/blob，沒有FlexNote帳號、CDN或API依賴。Cloudflare尚未部署或驗證真實網域。

匯出器檢查每個檔案不超過25MiB，配合 [Cloudflare Pages單檔上限](https://developers.cloudflare.com/pages/platform/limits/#file-size)（2026-11-11查閱）。大於此限制的PDF/附件明確報錯，第一版不自動拆檔或改上R2。實測基礎包490個檔案約83.84MiB，最大檔案為NotoColorEmoji字型25,097,144 bytes；首次網站載入尚有字型/WASM下載成本，沒有宣稱已完成網路效能優化。

## 針對性驗收

- 修改桌面接合前：`check-content-blocks.cjs` 真實slash、編輯、保存重開與獨立視窗全部通過；`check-nested-whiteboards.cjs` 建立、拖曳、側欄、循環拒絕、保存重開及CAS預覽通過。只重用這兩項直接相關歷史流程，沒有全套重測。
- `web-share-data.test.cjs` 5/5：子白板閉包/循環/重複、完整AST、未分享內容排除、缺失附件/子白板拒絕、非法引用/未下載外部圖片拒絕、白名單/回收站、空白白板。
- `web-share-export.test.cjs` 1/1：真檔案大小/雜湊、故意破壞CAS、缺檔、上一版不變、失敗目錄不當有效分享、舊純文字保留與靜態包範圍。這是檔案系統整合測試，不能替代UI。
- `check-desktop.cjs`：真實隔離Electron/Lexical/SQLite，輸入最新中文後直接按匯出，讀取輸出內容確認保存已完成；3張白板及圖片/PDF存在，未分享卡片排除；未知白板及未授權匯出目錄拒絕。
- `check-browser.cjs`：真實Chrome，平移/縮放、切第二分頁、提示標題/正文、唯讀輸入與Delete、卡片內原圖解碼、圖片檢視器、PDF跳第3頁、根/子/孫、重整/返回/麵包屑/直接網址、拒絕未發布白板。攔截外站請求、檢查所有HTTP都是包內GET、無API/POST、`share.json`不變。不是DOM存在即通過。

重現：先 `npm run prepare:web-share`，再 `npm run test:web-share`；桌面入口 `npm run test:web-share:desktop`。Windows Electron測試需在可正常啟動其sandbox的本機權限執行，不能用關閉sandbox或改ACL替代。建置器沿用既有私人來源；沒有來源的乾淨checkout不能憑空重新產生原版registry。

範圍：目前驗收Windows Chrome及指定卡片組合。未驗收實體行動裝置、其他瀏覽器、大型公開流量、音影音/網站嵌入、所有心智圖或PDF註記組合；沒有匯出私人歷史、帳號、Token或同步設定。第一版為靜態時間點分享，之後編輯需重新匯出及重新發布。

## 本次交付實測收據

- 程式提交 `7daf875a137c`，已push。可攜版 `release/InkBridge-0.5.15-7daf875a137c-f07a27/Start-InkBridge.bat`；build ID `c2503f32562ec5008a9fb534bbc0c47ace3ef85b3c786d2222f76b4f8dc60d38`，建置時程式碼乾淨。沒有寫入正式Profile。
- **可攜版實跑** `check-desktop.cjs`：最新Lexical內容→SQLite→匯出；關閉提示後第二次匯出仍成功，兩包分開、前一包不變。資料位置 `%TEMP%/inkbridge-original-modules-web-export-S8XN8M`。
- 從上述可攜版實際匯出後整理為 `release/InkBridge-Web-0.5.15-Demo-7daf875/`，再跑完整本輪唯讀Chrome流程通過；證據 `%TEMP%/inkbridge-web-share-oLZSP5`。展示包只含合成筆記、綠色PNG與3頁測試PDF。
- **實際Start-Web.bat** 啟動本機伺服器後，另用Chrome開根網址並點入子白板成功、無pageerror；測試結束已關閉該伺服器。私人截圖 `private-original-editor/web-share-research/start-web.png`。
- Demo ZIP：`release/InkBridge-Web-0.5.15-Demo-7daf875.zip`，SHA-256 `2361705bd219a1e70fade4f1fe7f91f327fc24e30e3864644fae4e432316f561`。發布到Cloudflare及實際網域仍屬下一步。
