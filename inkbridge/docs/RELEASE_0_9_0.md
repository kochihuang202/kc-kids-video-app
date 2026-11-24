# InkBridge 0.9.0 — 標籤頁與集合

2026-11-24（Asia/Taipei）。來源 commit `810f69c4b422`，發布序號 32，SQLite schema 1。資料沿用原工作區與快照，不執行 schema 遷移。完整來源與資料邊界見 [TAGS_PORT.md](TAGS_PORT.md)，回歸 REG-177。

## 使用方式

正常重開本機開發入口，或在可攜版按「更新並重新啟動」，確認左下角為 0.9.0。左側「標籤」可用；卡片原有的「管理標籤」持續使用同一份資料。

完整原版標籤頁包含分組、子孫標籤、改名、搜尋、清單／卡片檢視、顯示標籤下卡片及集合入口。新增與套用、移除、遞迴刪除有資料庫保存；刪標籤保留筆記正文。集合檢視及其欄位／值接入既有工作區 metadata。舊版遺漏的系統集合可讀取，首次實際編輯才落盤。

搜尋孫標籤會保留可到達的父層；改名後再搜尋或切換檢視不會恢復舊名稱。表格初始化補出的 null 排序／釘選與預設順序不算筆記變更，避免只瀏覽便製造分支；真正欄寬、排序與屬性修改仍保存。

## 相關驗收

- 50 項相關 Node 測試通過；針對最後的初始化無變更處理，集合／新增筆記 6 項再次通過。快照測試加入標籤、分組、集合、檢視、屬性與值的真實 SQLite/CAS 轉移及完整相等斷言，通過。
- `check-tag-page.cjs` 開發及最終封裝均通過：舊系統標籤唯讀進入、原生選單新增卡片、卡片管理、標籤頁入口、分組／子孫、改名、搜尋、檢視切換、顯示卡片、Table 集合、刪除取消／確認、保留筆記及重開相等。`check-native-tags.cjs` 舊有回歸通過。
- 複製的 0.8.1 實際按更新到 0.9.0、健康重開、最後一筆中文、本機設定及正常關閉通過。
- 0.8.1、0.8.0、0.7.8 的三個實際增量 ZIP 通過簽章 PowerShell Stage，基底保持原狀。完整 ZIP 3542 個簽章清單檔案驗證通過。

測試使用隔離合成資料，沒有還原或覆蓋正式筆記，沒有操作另一台實機。集合其他檢視與屬性有完整原服務及 SQLite 驗證，本次實際點選驗收集中在標籤樹、卡片管理與 Table。原生表格仍可記錄 AG Grid `resetRowHeights` 模組告警及其他原生 AI 圖示 404；本次基本表格內容與保存驗證通過，未宣稱全部多行欄位自動高度／AI 附加功能已驗收。既有排除的 AI 帳號及服務端功能仍不接入。

## OneDrive ZIP

交換目錄：`C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`。

- 完整包：`InkBridge-release-0.9.0-bd7ab387-5f3c-460f-82d4-c7568abf9172.zip`。
- 0.8.1 直升：`InkBridge-update-5a99640c-dfbe-49b0-accb-363f09061339.zip`。
- 0.8.0 直升：`InkBridge-update-c35acac7-3881-4e77-a238-0ef5ed86d6b1.zip`。
- 0.7.8 直升：`InkBridge-update-202ec0be-41fe-4ef2-92ef-6d7e9a91bd73.zip`。

BAT 在完整 ZIP 裡；解壓後執行 `Start-InkBridge.bat`。更新包約 11 MB，逐檔替換變更的程式內容；完整包約 235 MB，包含 Electron runtime。正式資料維持在既有 `%LOCALAPPDATA%\InkBridge` 或開發 profile，不能刪除該資料夾。

本機驗證及交付收據：`release/verified-0.9.0.json`、`release/final-0.9.0/stage-receipt.json`、`release/delivery-0.9.0.json`。這些包含本機路徑，依既有規則不加入 Git。成功交付後只清除舊完整程式包；資料快照、附件及舊增量保持。
