# InkBridge 0.6.2 發布收據

2026-11-16（Asia/Taipei）。程式基線 `68b6094b05af`，發布序號 18。

## 交付

OneDrive 交換資料夾：`C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`。
入口：`Start-InkBridge-0.6.2.bat`。首次自動驗證並安裝到本機，之後使用本機程式。
完整包 `InkBridge-0.6.2-68b6094b05af-972a39.zip`：229,274,394 bytes，SHA-256：
`ae93a6662c8ff82053cd84dd7407d3a27c17198bdaf8b140d0d87124878fef38`。
Build ID：`7a547fd5d03c6e8f9020547c78c4427865ab73350d722bad7ae2304e15a9882d`。

已新增兩條直接簽章增量更新；各 11,705,567 bytes、52 個異動路徑：

- 0.6.0 → 0.6.2：`101b7209-9078-45fe-8c1c-d71360a5e55c`。
- 0.6.1 → 0.6.2：`40134145-453c-4044-9f14-c568ea644866`。

只新增本次發布檔，未修改交換區的 snapshots、assets 或使用者設定。逐檔複製後核對 SHA-256，收據在本機忽略的 `release/delivery-0.6.2.json`。
這證明檔案已放入本機 OneDrive 資料夾，沒有宣稱第二台電腦已完成下載。

## 驗證

- 完整包 2,295 個檔案及 ZIP 雜湊符合 manifest；99 個產品來源／整合檔與最新工作目錄一致。
- `tests/program-updates.test.cjs` 與 `tests/onedrive-launcher.test.cjs`：2/2 通過。包含真實 PowerShell 套用、啟動失敗與檔案鎖定回復、錯誤簽章／基底／缺包、BAT 首次安裝、保留筆記及不降版。
- `check-portable-share.cjs`：0.6.2 實際可攜版，隔離資料、原生分享面板、背景 WebP 匯出與原圖不變均通過。收據暫存目錄 `inkbridge-portable-share-RDEeJn`。
- `check-release-deltas.cjs`：兩條實際發布增量在隔離副本通過簽章、基底檔案及 PowerShell Stage；基底不變。收據 `release/updates-0.6.2/stage-receipt.json`。
- `check-portable-update.cjs`：以 0.6.2 可攜版與合成增量實際按更新、重啟並取得健康回報，最新未保存的中文編輯及設定保留。收據 `release/program-update-acceptance.json`，暫存目錄 `inkbridge-update-acceptance-3pPHH5`。這是更新流程測試，兩條正式增量另由 Stage 測試驗證。
- Windows 程序／檔案替換測試最初受到沙箱限制；使用完整本機權限重跑通過，沒有改產品或削弱測試。

只執行封裝、分享與更新相關驗證。沒有重跑無關功能全集、重新部署分享網站、發布正式筆記或複製裝置金鑰。
另一台的分享金鑰須使用配對；百度網盤應用金鑰設定畫面仍為交接文件已知缺口，沒有把私人金鑰放進更新包。
