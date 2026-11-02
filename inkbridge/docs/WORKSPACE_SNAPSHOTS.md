# 工作區快照與雙電腦手動接力

## 使用方式

1. 重新執行 Start-InkBridge.bat。在左下齒輪 → 儲存與同步選擇並套用本機的 OneDrive 交換資料夾。
2. 按「建立快照」保存第一版。之後 Ctrl+S、保存按鈕、每 10 分鐘及正常關閉走同一保存流程；有已提交變更才新增快照。
3. 自行確認 OneDrive 已上傳。另一台電腦的 InkBridge 設定選擇對應的本機同步資料夾，按「重新掃描快照」。
4. 僅完整快照提供「載入此快照」。確認後先保存當前資料、驗證所選 DB/全部附件、暫存本機副本、關閉 SQLite、切換，然後透過 Electron relaunch 重新啟動。
5. 在選定版本上繼續編輯，下一份快照的 parentSnapshotId 指向所選版本。另一分支仍保留；不自動合併或刪除。

可攜 ZIP 的啟動及更新方式見 [PORTABLE_DELIVERY.md](PORTABLE_DELIVERY.md)；程式內更新檢查尚未實作。兩台電腦應使用相同可運行版本，沒有共用正在寫入的 SQLite。

## 交換格式

```
snapshots/<workspace UUID>/<snapshot UUID>/database.sqlite3
snapshots/<workspace UUID>/<snapshot UUID>/manifest.json
assets/<SHA256 前兩碼>/<SHA256>.<副檔名>
```

Manifest 包含 format/version、工作區/快照/來源電腦 ID、parentSnapshotId、UTC 建立時間、app/SQLite 版本、應用 revision、資料庫大小及 SHA256，以及全部 catalog 附件的 ID、原本邏輯路徑、共用物件路徑、大小及 SHA256。沒有 latest 指標檔；裝置身分與目前快照基準只存本機 Profile/snapshot-state.json，依交換根目錄與工作區分開記錄。

附件保留原始 bytes，使用現有 SHA256 CAS；不嵌入 DB，也不逐快照複製。新 CAS 物件先寫唯一暫存檔、fsync 再改名發布；已存在物件需驗證相同雜湊。未完整到達的附件會阻止載入，不會因看到 manifest 就宣稱完整。沒有自動清理任何歷史快照、CAS 或 Restore 備份。

## 保存一致性與來源適配

沿用我們自寫 snapshot-prototype 的 CAS、唯一快照/父版本、Manifest 最後發布、完整性驗證、失敗保留上一版與先保存再還原設計。原型的九庫/node-sqlite3 部分不適用目前 InkBridge 的自有單庫 Schema；沒有重寫 Canvas 或 Schema。

主/子編輯器透過既有 flush/Commit ACK 等待實際內容入庫。單一 DB Worker 序列處理 VACUUM INTO，輸出到本機唯一 staging 檔；備份完成後才從該備份讀取 revision 與附件 catalog，避免從持續變化的 live DB 混配清單。整份 DB 同時保留卡片、白板、引用、標籤、歷史及其他 meta。新編輯可繼續排入下一份快照，沒有用固定等待延遲判斷已保存。

[SQLite 官方 VACUUM INTO 說明](https://www.sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause)確認其輸出是一致快照。額外 fsync 備份與發布檔案；不對 live DB 做一般檔案複製。當前 WorkspaceDatabase 明確使用 journal_mode=DELETE、synchronous=FULL，不是舊版 FlexNote SQLite 3.44.2 的並行 WAL checkpoint 機制。

無變更以自身交易 revision 與已成功發布基準比較，仍會驗證上一份快照存在且完整；不以 mtime、data_version 或靜置幾秒判斷。快照發布後驗證成功才更新本機基準。中斷可能留下未完整的唯一目錄，掃描會標示而不覆蓋舊版。Manifest 完整不代表版本祖先已全到齊；祖先缺失時標示關係未確認。

## 還原與異常恢復

目前支援 inkbridge-snapshot v1、INKB application_id、自有 Schema user_version=1。讀取前完整驗證資料庫 SHA256、integrity_check、foreign_key_check、workspace/revision，以及附件 catalog 的逐項覆蓋、路徑、大小與雜湊。已知 flexnote://file 內容引用若缺 catalog 也拒絕保存/載入。新格式或新 Schema 必須另行實作遷移，不自動猜測轉換。

所選 DB 與附件先複製到本機 Restore-UUID 並重新驗證，才關閉目前連線。切換 Workspace/、files/ 前寫入持久 restore-journal；原目錄移到 Restore-UUID/previous，保留原 snapshot-state。切換失敗用同一恢復程序回復；程序若中途終止，下次啟動在開 DB 以前先讀日誌回復未完成切換。已完成切換記錄 committed 後保留新版本與舊備份，不清除任何分支。若 DB 已關閉才遇到錯誤，以受控重啟重新開啟恢復後資料，不繼續使用失效連線。

## 驗證及限制（2026-11-02）

- 定向 Node 測試 12 項通過：既有 DB/worker 9 項、設定 1 項、排程 1 項、快照/還原整合 1 項。
- 整合測試涵蓋真實 DB Worker、一致性備份、全部 graph 回建、CAS bytes、無變更、不完整發布、缺附件再到齊、A/B 兩個獨立本機 DB 從相同 V1 產生分支、四個切換階段失敗回復，以及模擬沒有執行 catch 的中斷後啟動恢復。
- 真實 Electron check-storage-settings 通過：主/子 Lexical 最新文字、Ctrl+S、無變更不重複、正常關閉補存、重啟、掃描分類、取消載入、載入舊版後重新啟動及保留新版。原生選擇/確認對話框及自動 relaunch 在測試中攔截；載入後由測試重新啟動相同 Profile，並非已驗收實體第二台電腦的自動啟動。
- 排程使用相同真實保存入口；600000ms 間隔、重入、錯誤後重試由注入時鐘的定向測試驗證，未在此輪實際等待十分鐘。
- 既有 check-standalone-windows、check-board-windows 相關關閉/衝突/立即保存回歸通過；未重跑整套桌面測試。
- 尚未實測兩台實體電腦與 OneDrive Files On-Demand 的真實傳輸順序、離線及網路恢復；現在的缺檔/大小/雜湊檢查會保守拒絕，使用者待檔案到齊後重掃。沒有監測 OneDrive 上傳進度。
- 尚未做大型工作區快照耗時/記憶體測量。備份在 DB Worker，完整性檢查與檔案發布仍有成本；無變更目前也會先建立本機候選備份來判定版本，尚未優化為預檢 revision。
- Windows 目錄改名搭配持久日誌保護程序中斷；未宣稱已驗收斷電/磁碟硬體故障。若不完整 CAS 由外部同步到達，保存會保留現況並報錯，等待完整到達，不自動覆寫它。

程式入口：src/main/workspace-snapshots.cjs、workspace-restore.cjs、snapshot-scheduler.cjs；UI/生命週期整合：scripts/original-reuse/host.cjs、storage-settings.mjs、board.mjs、standalone-card.mjs。
