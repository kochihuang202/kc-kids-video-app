# 標籤頁、集合與保存邊界

2026-11-24。FlexNote 1.1.70，已安裝 ASAR SHA-256 `55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b`；不啟動正式 FlexNote profile。

## 原版來源

保留完整標籤頁 82138、工具列 72309、Redux 76776、集合入口 14656、集合父元件 27677，及格狀／表格／看板／清單等延遲載入 factories。依原始 chunk 身分登記，避免新版父元件仍向舊 runtime 請求 `84840.undefined.js`。`prepare-tags.cjs` 重用既有 inert AST 恢復流程；可重跑，保留同一 overlay 的相依模組，不因它已存在 registry 就從下一份 receipt 遺漏。私有來源不進 Git。

REA 靜態來源證據：背景服務選定範圍 `ev_a747ca55286f7e268ee745608b3d6b365fcdda5fe1d28b1fa8646cca01a81735`；選定標籤父頁 `ev_54383f8da0d28bcdec7b4411ef51a22828230e37498193590caee80e83b8db39`。這些是靜態來源範圍，不代表完整應用 runtime。父元件與既有共享依賴另做 AST ABI 核對，1085 個已識別匯出使用沒有缺失；React／router 動態匯出等仍以實際 Electron 流程驗證。AG Grid 1645 與目前安裝原版的 factory hash 相同。

## 接通的鏈

- 側欄「標籤」→完整原生清單／卡片檢視→分組、子孫標籤、改名、搜尋、卡片數量／卡片顯示、多選與排序來源動作。
- 點標籤→完整原生集合頁；原表格與其他檢視、屬性及值使用獨立 SQLite `meta` 記錄，不另建資料庫、不改 schema。保留原 DTO 與既有 card/note editor。
- `original-tags.mjs` 負責群組、標籤及卡片關聯。`original-tag-collections.mjs` 負責集合、檢視與屬性。新增時沿用原版 Redux 動作，更新／刪除補齊 canonical graph 刷新；避免重複新增或改名後被舊狀態覆回畫面。
- 搜尋子孫時保留必要父層並展開結果，不改寫儲存的階層或折疊值。這修正原父頁只留下匹配 ID 而丟失根節點的問題。
- 原本已排除的帳號／服務端 AI 自動填寫不接入；原生表格的對應自動填寫控制不作為可用功能。

## 不遺失資料

新增標籤／群組與批次套用先全部驗證，再一次 stage。刪除標籤遞迴清除子孫、群組引用、card-tag、其集合及檢視；不刪卡片正文，也不誤刪共用屬性。正常新增筆記依原服務自動加入系統 NoteCard 標籤；從指定標籤新增則只套該目標。既有筆記的空標籤關聯不擅自重新分類。

空工作區的內建標籤使用工作區身分派生穩定 ID 與固定內建時間，讀取不 commit；另一視窗不會另產生一組。舊 adapter 遺漏的系統集合／Table 檢視，按原版完整 constructors 做穩定投影，首次有效編輯才同批保存。既有標籤 ID 保留，不以新 ID 重建正式資料。

新的 meta 種類跟隨既有快照及多視窗寫入預條件。合併驗證納入標籤階層、群組、集合／檢視及屬性引用；刪除與另一台新增引用碰撞會要求處理，不能留下懸空引用或循環。

## 驗證與重建

50 項直接相關 Node 測試通過，受影響快照測試再加入標籤／集合／屬性值的實際資料庫轉移及完整相等驗證通過。`check-tag-page.cjs` 真實 Electron 操作卡片標籤管理、側欄、分組／子孫、改名、搜尋、檢視切換、顯示卡片、集合導覽、刪除取消／確認、保留正文及重開；`check-native-tags.cjs` 歷史回歸通過。舊測試改為明確建合成卡片，不再假設空 profile 自帶樣例。

重建順序：`node scripts/original-reuse/prepare-tags.cjs` → `collect.cjs` → `apply-integration-patches.cjs` → `collect.cjs` → `check-diary-todo-source.cjs tag-source`。封裝器也會套用可重建的小修補。所有驗收使用隔離資料；未操作另一台實機或覆蓋正式筆記，不把合成快照測試稱為真實 OneDrive 傳輸驗收。
