# InkBridge 0.7.8 — HTML 資料同步修正

2026-11-18，runtime commit `f1f65c9e11c5`，發布序號 29。

## 原因與修改

使用者截圖 v2149 顯示「資料庫或附件尚未完整到齊」。本機交換區該份 SQLite 與全部 126 個附件經唯讀完整 SHA-256 驗證均通過。HTML 的完整快照驗證器已接受新格式，但日常自動同步實際使用的輕量索引仍只接受舊圖片／PDF 副檔名，故 `.html`／`.htmlbundle` 被誤報為尚未到齊。

此外，durable outbox 複製時未傳 manifest 的 byte length，合法的零位元 CSS／JS 會被通用非空檢查擋住。原先 HTML 測試走較早的 snapshot publisher，未覆蓋這條實際 outbox／index 路徑；本次補上真實路徑回歸。

共用嚴格 CAS 路徑檢查給完整驗證、自動索引和唯讀診斷，仍核對雜湊目錄及檔名、拒絕越界及未知副檔名；outbox 傳入 manifest bytes，允許合法空檔。SQLite schema、版本鏈和未同步修改保護規則均未變。正式筆記未還原、覆蓋或重新發布。

## 驗證

- HTML／同步／快照／保留／日期排序相關 Node 15 項通過；最後 CAS 路徑檢查整理後重跑 HTML-sync 和 workspace-snapshot 4 項通過。
- ZIP、完整包直升、增量、壞簽章及失敗回復相關 5 項通過。
- `INKBRIDGE_HTML_SYNC=1 node scripts/original-reuse/check-seamless-sync.cjs`：開發版及最終可攜版均通過。含 HTML、空 CSS 的新版在啟動及原視窗自動接上；共同最新版不產生假版本；多視窗、觀看位置、組字屏障、遲到 IPC 拒絕和真實雙邊修改保留通過。
- 實際複製的 0.7.7 安裝，使用 ZIP-only 簽章增量、滑鼠按更新按鈕，完成安裝與重新啟動；新版健康回報、資料庫最後一筆未手動保存中文、本機設定及正常關閉均通過。測試工具原先等待原版動畫按鈕穩定而超時，改採真實滑鼠座標點擊；仍驗證完整安裝結果，未以 DOM 事件或直接呼叫更新 API 取代。
- 0.7.5、0.7.6、0.7.7 三條實際發布增量均通過 PowerShell Stage；原始基底未改。完整 ZIP 3535 檔逐一雜湊驗證通過。

驗證皆為本機隔離雙工作區／安裝；未操作另一台實機，亦未取得使用者另一筆程式更新失敗的完整錯誤。不可將上述驗證宣稱成另一台已恢復同步。

## OneDrive 交付

交換根目錄僅發布 ZIP，不另放 BAT。

- 完整包：`InkBridge-release-0.7.8-4685ab7a-6dfd-4eb0-854d-77afb07450ff.zip`
- 235175230 bytes；SHA-256 `2b36efd631ef4ec068b1c8ac4f0d2634ce124b9d7b63b6657a2c45520f8246f7`
- build ID `925e42295ad13f85b158c53621198913e50b8bcdad8d103c0563423502e08409`
- 0.7.7 直升 ZIP：`InkBridge-update-df589909-37fa-4b4a-9f81-6470d24d07eb.zip`，181429 bytes。
- 0.7.6 直升 ZIP：`InkBridge-update-bf6db722-604f-4816-a711-af2a796a23a1.zip`，183678 bytes。
- 0.7.5 直升 ZIP：`InkBridge-update-35686dd5-c08f-4e1d-b886-04911a124e11.zip`，11490255 bytes。

交付後只刪被取代的 0.7.7 完整 ZIP；舊增量、snapshots、assets 和使用者診斷檔保留。完整包解壓至 OneDrive 交換區以外的本機程式資料夾，從包內 `Start-InkBridge.bat` 啟動；已有相容可攜版可直接在程式按更新。這台目前實際執行開發入口，需正常關閉後從原入口重開才會讀入修正，開發目錄不被自動更新器覆寫。

本次現有 v2149 資料本身完整，升級不要求重貼 HTML、逐版載入或手動還原。真正未同步修改仍須保留，不能為消除提醒而強行選另一版本。

本機忽略的收據：`release/delivery-0.7.8.json`、`release/verified-0.7.8.json`、`release/final-0.7.8/stage-receipt.json`、`release/program-update-acceptance.json`。
