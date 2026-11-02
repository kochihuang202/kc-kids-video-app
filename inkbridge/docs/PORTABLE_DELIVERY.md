# Windows 可攜包交付

## 這台電腦

繼續用目前原始碼目錄的 Start-InkBridge.bat，保留原筆記位置。設定 OneDrive 交換資料夾後建立快照；畫面顯示建立並驗證成功代表本機交換區寫入已完成，上傳完成仍由使用者確認。

## 另一台電腦

1. 等 OneDrive 的 InkBridge ZIP 與工作區快照/附件完整到齊。
2. 將 ZIP 複製到本機並完整解壓，例如 C:\Apps\InkBridge。不要在 ZIP 內直接執行，也不要把執行中的程式資料目錄設到 OneDrive。
3. 雙擊解壓目錄的 Start-InkBridge.bat。內含原樣 Electron runtime，不需 Node.js/npm/FlexNote 安裝或管理員權限。
4. 左下齒輪 → 儲存與同步 → 瀏覽，選擇該電腦對應的 OneDrive 交換資料夾並套用。
5. 重新掃描快照，選擇來源工作區的完整快照 → 載入此快照。確認保存/重啟後即可接手。

## 資料與更新

可攜程式本身可換資料夾；每台電腦固定使用自己的 %LOCALAPPDATA%\InkBridge，包含 SQLite、附件、Profile、Recovery、Restore 備份、版本基準與設定。它不使用這台原始碼版的既有 Profile，也不自動搬資料；此電腦若改用可攜版，先在原版建立快照，再於可攜版載入。

目前更新方式：關閉 InkBridge、取得新版 ZIP、解壓到另一個本機目錄、啟動新 .bat。保留舊程式目錄；AppData 不隨 ZIP 覆寫。舊程式能否讀取新資料仍取決於 Schema 相容性，必要時載入事先保留的舊快照。尚未提供程式內自動更新檢查或下載。

## 建置與驗證

- `node scripts/original-reuse/build-portable.cjs`：依明確 allowlist 複製自有主程式/core/renderer、現有 renderer registry、必要 vendor 靜態資源與原樣 Electron runtime，建立 .bat/中文說明、逐檔 SHA256 Manifest、ZIP 及 ZIP SHA256。排除正式資料、既有 Profile、Session、筆記、附件、Recovery、設定、Token 與 REA 截圖/記錄。產物只在忽略的 release/，不提交 Git 或公開 Release。
- 不呼叫 FlexNote.exe、不修改 app.asar、不改動 Electron 二進位或繞過簽章。只用自有 host 載入既有私人 renderer 移植成果。
- `node scripts/original-reuse/check-portable.cjs`：真實 ZIP 解壓至含中文/空格路徑，逐檔核對雜湊，移除 Node PATH，以實際 .bat 啟動隨附 runtime，實際雙擊卡片進入編輯、輸入中文、Ctrl+S、正常關閉、換程式目錄及重啟後核對 SQLite 內容。本機 AppData 導向隔離 TEMP；不接觸正式資料或預設交換設定。
- `node --test tests/original-profile-startup.test.cjs`：既有任意 profile 拒絕保護仍有效。新增可攜模式僅使用固定本機 InkBridge 目錄，既有 source/test 路徑檢查保留。
- 本輪沒有重測整套白板/編輯器。沒有宣稱已在另一台實體電腦測試；已驗證無 Node PATH 與程式路徑改變的可攜場景。

`release/last-portable-build.json` 記錄實際 ZIP、SHA256、大小。`release/portable-test-result.json` 記錄驗收產物及 TEMP 證據位置。包內 portable-build.json 記錄每個輸出檔案的來源內容雜湊。
