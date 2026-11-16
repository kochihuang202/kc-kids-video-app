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

交付驗證（2026-11-16）：

- 封裝版兩項Electron流程亦通過。接續測試收據：Temp/inkbridge-seamless-exchange-Okprxz；還原及中文測試：Temp/inkbridge-settings-exchange-CCmRsg。這是隔離雙端資料與真實Electron視窗驗證，未遠端操作另一台實機。
- 完整ZIP：InkBridge-release-0.7.2-bacfbc19-30fc-4bf6-ad42-fc232f993122.zip，232951404 bytes；簽章與2303檔驗證通過。SHA-256 e88426be149b1a2dd8c794305f4280992ef08ec0573382762e06e9adeda31c6d。
- 0.7.1直接到0.7.2增量ZIP：InkBridge-update-e48fd100-31e3-4d2a-a565-fb81201f3435.zip，142054 bytes、8檔；簽章及隔離安裝的PowerShell Stage通過，來源程式不變。
- build ID 1f51d8b282792878cb7f89c7510d5bc45e4d80bd4f8fd5ff4da1b818c0b5f06b，發布序號22。
- 兩包已複製到指定OneDrive根目錄並核對雜湊；僅刪舊0.7.1完整ZIP，保留資料快照、附件、診斷與增量包。交付收據：release/delivery-0.7.2.json（本機忽略檔）。OneDrive雲端傳送完成仍由OneDrive負責。
- 兩端換用0.7.2；ZIP內Start-InkBridge.bat可啟動。已經是0.7.1的可用程式內更新；其他版本可直接解壓完整包到新的本機程式資料夾，沿用既有本機資料。
