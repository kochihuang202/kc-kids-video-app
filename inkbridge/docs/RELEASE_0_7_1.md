# 0.7.1 備份清單互動修正

背景掃描不再走保存／還原的全頁鎖定流程，不再停用還原及關閉按鈕。未變動版本保留原DOM節點；刷新維持詳細資訊展開、焦點與捲動位置。只有真正保存或還原才暫停操作；已關閉或已啟動還原時不套用遲到背景結果。

可還原／待到齊備份與純版本關係分開。純關係預設收於詳細歷史，數量分別列出，不再將其混稱完整備份。2026-11-16唯讀核對本機交換資料夾時有26份DB、34,119,680 bytes及67筆lineage；這是查詢當時本機數字，不代表另一台已下載數量。

回歸：check-sync-settings.cjs先以暫停scan IPC重現還原按鈕disabled失敗；修正後驗證掃描pending期間按鈕enabled、相同節點及展開／捲動保留，並通過原有自動到達刷新、一鍵還原、最後中文備份、forward head及不被自動切回流程。只測相關流程，不修改同步資料、清理規則或正式筆記。

交付：封裝基線4cac395a2d94，序號21；真正封裝版同一Electron流程通過。完整ZIP內2302個檔案與增量ZIP內4個檔案的簽章及內容雜湊通過；實際0.7.0副本stage至0.7.1通過且基底不變。

- OneDrive完整包：`InkBridge-release-0.7.1-e14487bb-ed09-4c7c-a094-ffc2cff4757f.zip`，232949365 bytes。
- SHA-256：`0fa22fe0cfde5d04dcee6b07b257eecdcfba698d34d49dbbd8f80144b5a09bc0`。
- 增量：`InkBridge-update-a302f2b8-b176-4571-a976-c6f12e91d1eb.zip`，127695 bytes，來源為實際交付的0.7.0 build b599da24…。
- 新完整包複製後雜湊一致，已移除舊0.7.0完整ZIP。沒有刪除資料快照、附件、lineage或使用者診斷。收據：忽略的release/delivery-0.7.1.json及release/final-0.7.1/stage-receipt.json。
