# 0.7.2 恢復共同版本接力

修正0.7.0把接續共同最新版也做成forward restore的回歸。完成所有編輯器flush後，若本機沒有額外修改，且選定的是目前、內容等價或後續版本，就沿用收到的版本ID，不產生新checkpoint。真正回復祖先版本或明確解決本機修改仍建立保護後的還原版本。

已產生的假分支只在兩項證據同時成立時合併判讀：restoredFrom是原基準的相同／後續版本，且經原始DB SHA驗證後，boards/contents/instances/meta所有欄位逐列比較一致。只忽略SQLite實體頁面／header差異與內部commit receipts，不忽略文字、格式、位置、設定或共享metadata。不得依時間或revision大小判勝者。

比較成功的輕量證明寫入lineage-equivalent，綁定兩份原DB雜湊及比較版本；完整舊備份輪替後仍能辨識。缺檔、壞雜湊、不明關係均不能產生等價證明。假分支的大備份只有在證明其對應基準已屬目前歷史時，才納入既有輪替，不刪真正分支。

相關驗收：

- sync-continuation新測試先重現branches而非newer，修正後通過；已產生假分支→對端新內容可接續、實際本機修改仍阻止覆蓋、重啟及刪除舊payload後證明仍有效、真正祖先還原不被消除。
- 同步、歷史保留、Outbox及startup status相關Node測試13項通過。
- check-seamless-sync新增真實Electron先手動接共同最新版，斷言同版本ID且checkpoint數不增加，再由另一個獨立SQLite繼續修改，原視窗自動接收；原有組字、視角、多視窗、遲到IPC及真衝突保護仍通過。
- check-sync-settings原有背景掃描穩定、一鍵歷史還原及最後中文保護通過。

不直接改寫正式筆記或既有版本ID／parent紀錄；等價判讀不等於自動合併不同內容。
