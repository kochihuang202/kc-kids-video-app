# InkBridge 0.8.1 — 舊版快取造成的版本關係衝突

2026-11-20（Asia/Taipei）。來源 commit `73003a183d02`，發布序號 31，SQLite schema 1，沒有資料庫遷移。

使用者重開 0.8.0 後仍被啟動畫面擋住，錯誤為「版本關係紀錄衝突」。正式資料唯讀重播確認：0.7.8 曾把另一台 0.8.0 合併快照的 lineage 投影成本機舊格式，遺漏 `mergeDigest`；兩份紀錄的資料庫 SHA-256、長度及父版本完全一致。這是紀錄格式相容問題，不能要求以本機為準來處理。

現在只在原有因果欄位與有效的資料庫身分完全一致時，允許一方缺少新版合併／權威世代欄位，並保留另一方較完整的欄位。兩邊已定義但不同的新欄位、不同父版本或資料庫雜湊仍阻擋。只合成讀取中的版本圖，不改寫既有不可變 lineage，不覆蓋筆記，也不指定權威版本。

## 驗證

- 新回歸先重現原錯誤，再修正；27 項相關 Node 測試通過。修改過的實際 merge/index/startup 流程另重跑 12 項通過，包含共同合併後另一台繼續編輯及本機未同步中文保護。
- 正式本機與 OneDrive lineage 的唯讀重播成功，106 筆紀錄讀取完成，原本遺漏的 mergeDigest 保留。沒有還原正式資料。
- 維護中的 `check-auto-merge.cjs` 加入舊格式快取後重新啟動 Electron；開發及最終 0.8.1 封裝通過。後續接收、最後未手動保存中文、多視窗、同一原生視窗、逐項真衝突及重開續選通過。
- 複製的 0.8.0 實際按「更新並重新啟動」到 0.8.1 通過，最後中文與設定保留。實際發布的兩個 ZIP 通過簽章 PowerShell Stage；完整 ZIP 3541 檔逐一驗證通過。

實體另一台電腦沒有由本次測試操作；隔離測試不能代表其 OneDrive 傳輸已完成。兩台換用 0.8.1 後會自行兼容上述舊快取，無須手動改 JSON 或按「以這台為準」。這台的開發入口須正常關閉再開，才載入主程序修正。

## ZIP 交付

完整包與 0.8.0／0.7.8 直升增量使用既有簽章通道。BAT 僅在 ZIP 內；交付驗證收據位於本機忽略追蹤的 `release/delivery-0.8.1.json`、`release/verified-0.8.1.json`。正式快照及附件不清理；只在完整 ZIP 驗證後移除舊完整程式包。

OneDrive 交換目錄：`C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`。

- 完整包：`InkBridge-release-0.8.1-9d15541a-3ccb-4f4c-871d-d3058bb53c03.zip`，235197172 bytes。
- 完整包 SHA-256：`7e21997c0ccb10d845fd51c47190cb538be5aac03d51db0d1161f7025f08b9f9`。
- 0.8.0 直升 ZIP：`InkBridge-update-497ebfe5-db38-48c8-bbe0-3e21cb5367b6.zip`，173335 bytes。
- 0.7.8 直升 ZIP：`InkBridge-update-6dfb56b7-d311-4b60-a3cd-a1489b8ed631.zip`，238897 bytes。
- 舊完整 0.8.0 ZIP 已在新完整包驗證後移除；舊增量、資料快照與附件保留。完整包解壓到本機程式目錄後執行 `Start-InkBridge.bat`，沿用既有 `%LOCALAPPDATA%\InkBridge`，不要刪除該資料目錄。
