# 本機交換資料夾設定

啟動 `Start-InkBridge.bat`，在左側欄最下方按齒輪 → 儲存與同步 → 瀏覽，選擇該電腦的 OneDrive 交換資料夾，檢查後套用。例如本機預計使用 `C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`。另一台電腦可有不同的本機路徑。

設定存在目前獨立 Profile 的 `Profile/storage-settings.json`，不寫到 OneDrive。套用會先等待已開啟編輯器的保存 ACK；失敗保留舊設定與草稿。選資料夾不會移動資料、切換工作區或讓兩台電腦共用正在寫入的 SQLite。

本功能是 InkBridge 自有的交換路徑設定，沒有啟用 FlexNote 帳號或雲端服務。沿用既有 editor/coordinator/主寫入者保存流程；非關閉 flush 不會讓視窗 inert。IPC 僅接受原生瀏覽選取或已保存的路徑；拒絕根目錄、程式及本機資料目錄的交疊與 junction 指向交疊。

「檢查資料夾」會建立一個唯一暫存檔、fsync、讀回及刪除，列出是否存在 snapshots/、assets/，不判斷 OneDrive 上傳狀態或快照完整性。不存在的交換目錄需先建立或使用 Windows 瀏覽對話框建立。

已接通快照建立、掃描與手動載入，操作與驗證見 [WORKSPACE_SNAPSHOTS.md](WORKSPACE_SNAPSHOTS.md)。尚未交付：程式版本檢查與跨電腦可攜 ZIP。沒有自動設定使用者正式 OneDrive，也沒有複製正式資料。本次隔離測試僅使用 TEMP 目錄。

## 驗證（2026-11-02）

- `node --test tests/storage-settings.test.cjs`：通過，路徑/原設定保留/探測清理/損壞設定。
- `node scripts/original-reuse/check-storage-settings.cjs`：實際 Electron 通過；取消、檢查、保存失敗阻擋套用、主/子 Lexical 文字 Commit ACK、重啟路徑與內容保留、沒有搬移資料。僅原生選擇對話框及 OS 開啟資料夾在測試中攔截返回，UI 點擊與檔案讀寫為真實操作。
- `check-standalone-windows.cjs`、`check-board-windows.cjs`：相關多視窗保存/關閉/衝突回歸。
- 設定畫面截圖保存在測試 TEMP Profile 的 storage-settings.png，已目視確認。沒有宣稱實體 OneDrive 雙電腦同步已完成。
