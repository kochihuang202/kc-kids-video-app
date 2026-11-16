# 0.7.0 同步與 ZIP 交付

2026-11-16。程式序號20，資料庫schema仍為1。

資料完整checkpoint與immutable lineage分開。清理中間SQLite後，版本關係仍可讓落後電腦直接載入最新完整checkpoint。每台本機的額外修改、待送快照與真正分支不自動覆蓋。首次從舊版遺失的因果關係若無法補回，仍須一次明確選定版本；先保留本機快照後建立新的forward restore版本，不能按日期猜祖先。

設定開啟自動掃描／頁面開啟補查、日期新到舊、缺檔不可還原、完整性只在目標載入時驗證。手動還原不重複確認，所有視窗flush後保存目前資料，再切換並建立新的後續版本，避免autoscan撤銷還原。正常備份採FlexNote已查證的10份＋時／日／週／月稀疏保留；lineage與未決分支獨立保護。

程式發布只有單層ZIP，根目錄直接有Start-InkBridge.bat；release.json在ZIP內簽署逐檔內容，無自我引用ZIP雜湊。新客戶端優先直接delta，否則full latest fallback。舊客戶端需要先以此完整ZIP換用一次。發布前逐檔串流驗證，複製後核對整包雜湊，最後才移除舊完整程式包；不刪snapshots/assets/使用者診斷。

## 已通過相關驗收

- 同步／保留／排序／診斷／交付Node測試16項，lineage與ZIP更新7項；新增release ZIP串流驗證後，交付與ZIP更新5項重跑通過。
- check-seamless-sync：原視窗自動接最新、多視窗、視角、組字屏障、遲到IPC拒絕、真衝突不覆蓋。
- check-sync-entry：歷史中段清理後直接接新checkpoint、缺檔到齊自動重試、首次配對及舊資料保留。
- check-sync-settings：自動掃描、檔案到達刷新、日期排序、目標還原、SQLite中保留還原前最後中文、forward head及auto check不撤銷還原。

原失敗原因：測試的getByRole('textbox').last()實際命中設定的電腦名稱欄位；先前沒有確認中文進入筆記。修正為真實獨立卡片編輯視窗，先斷言中文存在，再在還原後逐份查備份SQLite，保留原本的內容斷言。亦修正測試在還原尚未提交完成前讀head的競態，以及多視窗列舉順序假設。測試結束使用隔離程序退出；不把這項測試當一般關窗生命週期驗收。

不宣稱已操作另一台實體電腦或知道OneDrive尚未下載的版本。現有另一台診斷的舊基準不在保留證明內，不能偽造已恢復的祖先關係。必要時一次選最新版並保護舊資料，其後走新lineage接續。

最終封裝與交付收據保存在忽略的release目錄，不提交私人模組、ZIP或筆記。

## 最終交付

- 程式基線：101406aa3c15；Build ID：b599da2409ecd0c04cf7ac6531c6df9b3c9b2c7b8370f9fdd50eb5b4faf4ccf3。
- OneDrive：`C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge\InkBridge-release-0.7.0-b7696013-f3a8-4f3f-84c4-81ca7b4a033d.zip`。
- 232,948,659 bytes；SHA-256：`3eff6f1186a15fe6d4c158f95ec772226eca63e21700b7c6fdd601596b04e7cf`。
- 2,302個簽章清單檔案串流驗證；真正封裝版check-sync-settings及check-sync-entry均通過。settings驗收等待主程序「已還原選定內容」通知，不能在DB切換中途讀取head就宣告完成。
- 實際0.6.3程式副本→0.7.0完整ZIP的PowerShell Stage通過；基底未修改。長度接近真實AppData的測試資料路徑避免把完整安裝檔名重複接到暫存路徑造成MAX_PATH假失敗；未宣稱任意超長路徑支援。
- 新ZIP複製後SHA一致，已清除舊0.6.2／0.6.3完整ZIP及舊啟動側檔／雜湊；資料快照、附件與使用者診斷未刪改。收據：release/delivery-0.7.0.json、release/final-0.7.0/stage-receipt.json。
- 兩台先正常關閉舊版，完整解壓此ZIP，執行根目錄Start-InkBridge.bat。只交付ZIP，不要求OneDrive同步BAT。既有已斷鏈資料可能需一次明確選新版並自動保護本機，不能保證已遺失的歷史憑空恢復。
