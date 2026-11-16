# InkBridge 0.6.3 — 同步歷史辨識修正

2026-11-16。只修正資料同步與附加唯讀診斷，不修改正式筆記或重新部署網站。

## 原因與修正

0.6.2 的 retention.json 記錄保留的舊快照皆為 anchor 的祖先，卻只用這項證據辨識「已在最新版本的電腦」的歷史。另一台仍停在保留的舊快照時，parent 鏈已被清理，最新快照與舊歷史可能被錯判為 branch/unknown。首次配對亦可能把這些舊歷史列成多個候選。

新版在本機同步基準確實列於保留紀錄、且 anchor 存在時，辨識 anchor 及其後續版本；其他已證明被該 anchor 取代的歷史不列為衝突。沒有以日期或 revision 排大小。真分支、本機額外修改、已刪除且沒有證明的同步基準，仍不自動覆蓋。

這修正已重現的缺陷，尚未取得另一台的同步狀態，不能宣稱所有卡住情況都已解決。仍卡住時，執行包內 `app/scripts/original-reuse/Diagnose-Sync.bat`，將同資料夾產生的 JSON 交回。只讀版本、同步設定及檔案可用性，不讀筆記正文、資料庫內容或金鑰。

## 驗證

- 新增真實 filesystem retention 回歸先失敗（預期 newer，實際 branches），修正後通過。
- 同步相關 Node 測試 10/10：保留歷史、真分支、本機額外修改、不明基準、離線 Outbox 及診斷隱私。
- `check-sync-entry.cjs`：A→B→C 清理 B 後，缺 C 的資料庫仍等待，檔案到齊自動接上；首次配對只列正確候選、舊資料保留、重開正常。
- `check-seamless-sync.cjs`：啟動／原視窗自動接力、多視窗／視角保留、組字等待、遲到 IPC 拒絕、真正雙邊修改不覆蓋。

完整 ZIP 與發布 SHA-256 見忽略的本機 `release/last-portable-build.json`；序號 19。僅將 ZIP 交付 OneDrive，BAT 在 ZIP 內，不要求 OneDrive 直接同步 BAT。
