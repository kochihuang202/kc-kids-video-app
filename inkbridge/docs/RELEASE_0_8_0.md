# InkBridge 0.8.0 — 自動合併、逐項衝突與指定這台為準

2026-11-18（Asia/Taipei）。來源 commit `72502ed71d4c`，發布序號 30，SQLite schema 1；不執行資料庫遷移。設計與邊界見 [SYNC_MERGE_AND_AUTHORITY.md](SYNC_MERGE_AND_AUTHORITY.md)。

## 已交付的行為

- 不同白板、不同卡片、各自新增卡片與同一卡片獨立欄位的修改，透過已驗證共同基準自動合併。文字與富文字文件成對處理，位置成對處理；原版座標鏡像、計數與觀看狀態不製造重複衝突。
- 真正重疊、刪除與編輯交錯、循環關係等逐項說明。選擇持久保存，可前後查看、重開繼續；內容變更會使舊選擇失效，不能覆蓋新輸入。
- 設定 → 本地存儲與備份 →「以這台為準，讓其他電腦對齊」。它發布本機整份目前工作區；同一工作區的其他新客戶端先保存未同步內容，再於原視窗對齊一次。舊世代晚到備份不混回目前內容；之後的新修改仍正常同步。
- 衝突面板提供「整份以這台為準」；啟動等待／衝突畫面也有入口。兩台同時指定會要求再次明確指定，不按時間猜誰勝出。
- 備份仍依原有疏化策略管理，額外保護各電腦需要的共同基準。合併及對齊前的資料保留，失敗回復資料庫、head 與共同基準。主程序屏障拒絕遲到寫入並保留原視窗草稿。

舊版已清掉的共同基準不能憑空重建；遇到這種情況會保留資料並說明，可明確使用「以這台為準」。兩台均需使用 0.8.0 才具備完整的新合併／接收行為。已開始執行的開發版需正常關閉並從原入口重開，才讀入新程式。

## 相關驗收

- 60 項相關 Node 測試全部通過；另補跑版本鏈檢查。包括三方合併、真衝突、共用卡片、座標鏡像、刪除、結構循環、同日期日記、共同基準保留、離線待送、過期選擇、同時合併收斂、權威世代、並行指定、失敗回復及附件／HTML／分享輸出。
- 真實 Electron 的開發版及最終可攜版：`check-auto-merge.cjs` 通過。原視窗及多視窗保持、最後未手動保存中文、文字與位置合併、兩項衝突前後導航、重開續選、過期選擇拒絕、共同合併後另一台繼續編輯均通過。
- 真實雙 Electron 程式及分離的模擬 OneDrive 快取：`check-authority.cjs` 開發／最終封裝版通過。實際設定按鈕、對方未知且未同步的中文先備份、原視窗對齊一次、晚到舊備份不復活、後續編輯正常同步、兩個主視窗正常關閉均通過。關閉測試使用實際主視窗 close 流程；不以測試工具對全部子視窗並行 app.quit 代替。
- 既有 `check-sync-settings.cjs` 通過：自動掃描、日期排序、還原前最後未保存中文保護、前進還原版本、原視窗保持。`INKBRIDGE_HTML_SYNC=1 check-seamless-sync.cjs` 通過：HTML、原視窗更新、多視窗、合成組字屏障、舊世代 IPC 及真衝突資料保留。
- 實際複製的 0.7.8 安裝使用 ZIP-only 簽章增量按更新到 0.8.0：健康重開、最後一筆中文、本機設定及正常關閉通過。
- 本次四條實際發布增量（0.7.5、0.7.6、0.7.7、0.7.8 → 0.8.0）均通過簽章 PowerShell Stage，原始基底未改。完整 ZIP 的 3541 個清單檔案逐一驗證通過。

測試使用隔離合成資料，未還原或覆蓋使用者正式筆記，未操作另一台實機，未測量真實 OneDrive 傳送速度。組字屏障以可重現的合成事件驗證，未操作實體注音輸入法。此次不需改動或重新部署 Cloudflare 分享站。

## OneDrive ZIP 交付

目錄：`C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`。更新只發布 ZIP，啟動 BAT 在包內。

完整包：`InkBridge-release-0.8.0-437d827b-d18a-466c-b39e-e92944422356.zip`

- 235196826 bytes
- SHA-256：`4aeb3e7cad962b9fc593e620995de5a185996bd078d2a4b805632660a200e4fa`
- build ID：`24fc57e1d588c086b3e65d7d8d2e80c485969388f011b4d160af50634d844f77`
- 可攜來源目錄：`release/InkBridge-0.8.0-72502ed71d4c-1cbef6`；建置時 sourceTreeClean=true。

| 直升來源 | ZIP | bytes |
|---|---|---:|
| 0.7.8 | `InkBridge-update-fc97703c-f3d1-4042-b1f8-a83bd0a58079.zip` | 238551 |
| 0.7.7 | `InkBridge-update-9913142b-bc03-4d1f-b108-6ba48d490f59.zip` | 244755 |
| 0.7.6 | `InkBridge-update-22917d85-361a-4115-8072-a198a8b7f0da.zip` | 246971 |
| 0.7.5 | `InkBridge-update-63de10c3-99f7-4cf6-8f7c-6660a7a64f41.zip` | 11535258 |

完整包包含 Electron runtime，所以仍約 235 MB；0.7.8 直升僅約 233 KiB。不必逐版安裝；沒有對應增量時，相容的新更新器可用完整 ZIP 直接到最新。手動換版時完整解壓至交換區以外的本機程式資料夾，執行包內 `Start-InkBridge.bat`；本機資料沿用 `%LOCALAPPDATA%\InkBridge`。

交付後 OneDrive 只保留最新 0.8.0 完整包；刪除被取代的 0.7.8 完整包。舊增量、資料快照、附件與使用者診斷檔未刪。

忽略的本機收據：`release/delivery-0.8.0.json`、`release/verified-0.8.0.json`、`release/final-0.8.0/stage-receipt.json`、`release/auto-merge-acceptance.json`、`release/authority-acceptance.json`、`release/program-update-acceptance.json`。測試截圖另存 `private-original-editor/merge-0.8.0-evidence/`。
