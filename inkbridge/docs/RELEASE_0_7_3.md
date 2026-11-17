# 0.7.3 日記與待辦

依目前安裝的 FlexNote **1.1.70** 確認來源。使用完整日記父頁面 55411、待辦父頁面 23997、日記明細轉址 37055 及缺少的依賴；原碼與可修改來源副本留在忽略的 private-original-editor，公開 Git 只含準備工具、介面接合、測試及研究結論。

來源身分：ASAR SHA-256 `55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b`。REA 原始包證據 `ev_2e2cb68a47136ac7f28cabfbd08a83d49b37ea9c03c1467ad870aea67964f02a`；選定待辦頁靜態證據 `ev_3567dd8bf49494409f42639ef5f5f3c31379ef01d32b873e55766315752655cf`；選定日記頁靜態證據 `ev_a15a908c8bcf1b524806a63d5d6d93fc3976c2ed05bd67687203053800f048b6`。這些是靜態來源分析，不宣稱操作了正式 FlexNote 帳號或資料。

## 行為與儲存

- 日記沿用最新版時間軸、單日、日曆跳轉、搜尋、檢視與統計介面。不同日期獨立保存；空白日期不建資料，查看與相同內容初始化不增加版本。離開頁面前等待現有編輯器 Flush／中文組字提交。
- 待辦沿用原版 Checklist 集中清單、完成篩選、搜尋、分組與排序、來源預覽；筆記、日記與白板文字的勾選回寫原 AST，保留格式。來源筆記的白板連結能回到原白板。
- 原版獨立任務的建立、編輯、子任務、排序、日期、勾選、刪除資料契約已接入；目前原版頁面主要入口仍是筆記 Checklist，不另造新增按鈕。
- 日記正文仍存 contents，日期對應存 meta 的 quick-note；獨立任務存 meta 的 todo。無 SQLite Schema 遷移，兩者隨現有工作區快照一起傳遞；新增多視窗寫入前置條件，不能靜默蓋過對方修改。另一台亦須換用新版，才有此介面。
- 特殊日記服務 DP／QF／z5／lH 原本略過 InkBridge 服務接合，已接回同一資料與提交界線，避免僅顯示但不儲存。待辦頁取來源內容及舊編輯器的輸入格式差異明確接合，不更新無關編輯器模組。
- 日記不混入普通筆記卡片庫。刪除保留正文，日期軟刪除；原版全域刪除入口支援 DailyNote 並整批先驗證。

## 建置與驗收

準備：`node scripts/original-reuse/prepare-diary-todos.cjs <最新原包>`，接著執行 `apply-diary-todo-patches.cjs`、`apply-integration-patches.cjs`、`collect.cjs`。準備工具釘選版本與雜湊，保留私有可修改副本；`check-diary-todo-source.cjs` 檢查父介面所需的已知匯出，動態／CommonJS 資料依賴仍由實際視窗驗證。

只跑相關測試：日記、待辦、工作區快照、多視窗前置條件、目錄／卡片庫及受影響的卡片刪除；實際 Electron 的 `check-diary-todos.cjs` 覆蓋空白讀取不寫入、中文最後一筆立即切頁、單日、搜尋、月曆、統計、待辦雙向勾選、完成篩選、來源跳轉、重開與版本不變。保存與跨機快照使用隔離 SQLite，未操作正式筆記；真實硬體中文輸入法未另做實體鍵盤驗收。

## 最終交付（2026-11-17）

- 封裝版亦通過上述流程，另補測混合卡片／日記任務，以及待辦頁直接編輯日記後切頁保存。原版此入口以ID而非date傳遞，接合層只從該筆已知日記解析日期。實測收據 `private-original-editor/diary-todo-result.json`；最後隔離資料 `Temp/inkbridge-original-modules-diary-todos-9kclh7`。
- 受影響既有 `check-shell.cjs` 的切換保存、組字等待、分頁與重開亦通過。相關Node測試分組通過，沒有重跑無關全集。
- 發布序號24，build ID `ac7e6898093543c32089bd6dac795e6dc6196a8f7772a6704ce4be2f81c7383e`。
- 完整ZIP `InkBridge-release-0.7.3-d5a554f8-6a6b-4756-8c37-7b5f29755c6f.zip`，232963882 bytes，2305檔簽章／雜湊通過。SHA-256 `4b473e95a948cf84cbba01d9e66ab99bf1aa3007dadd9b2570ea356112203a47`。
- 0.7.2增量ZIP `InkBridge-update-550e694f-89ef-4a09-8881-489b66eb327e.zip`，7924103 bytes、16檔；簽章及實際隔離PowerShell Stage通過，來源安裝未改。SHA-256 `f4956e19fe656a7a4ba19001ca07719facdb704903061b9e8f67631ce22b7af4`。
- 兩包已複製至指定OneDrive交換根目錄並核對，舊完整包及本次被取代候選已清除，筆記／附件／快照／診斷不變。交付收據 `release/delivery-0.7.3.json`（本機忽略檔）。OneDrive雲端到達時間仍由OneDrive決定。
- 0.7.2可在程式內按更新；或解壓完整ZIP到本機程式資料夾，執行內含的 `Start-InkBridge.bat`。OneDrive只交付ZIP，沒有另放BAT。兩台需使用新版，新增日記／待辦資料仍隨工作區同步。
