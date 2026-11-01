# 群組座標與持久化修正

2026-11-02，基線24272fc。修正使用者回報的「組成群組後卡片跑到框外」。

## 根因與原版對照

真實四卡片測試：原位置(100,200)，群組原點(60,160)，錯誤更新後卡片位置(40,40)。這正是相對座標被當作絕對座標的結果。

原版14153保留Canvas世界座標及parentId，持久化時減去父群組原點；原版99665在拖曳保存也執行相同轉換。19281提供groupNodeToSeverSection/sectionToGroupNode；24487取消群組時保留世界座標並更新parentId。此次沿用完整元件與99665 hook，沒有改寫Canvas渲染或拖曳演算法。

## 修改邊界

- original-sections.mjs：section服務、群組資料Map、遞迴父群組座標投影、建立群組及初始成員的同次SQLite提交、取消群組時保留成員位置。
- database.cjs：既有meta增加section分類，校驗白板、座標與父群組，拒絕循環、跨白板、不存在父群組及尚有成員的刪除。不搬動既有資料表。
- board.mjs：掛原99665拖曳/刪除流程、原群組標題保存回呼；完整scene載入群組與卡片。
- original-note-writes.mjs：相對位置儲存後經完整projection回到Canvas；新增附件/卡片時不再丟掉群組節點。
- original-shell.mjs / host.cjs：明確section服務及本機模組路由。

board.mjs SHA-256：

- before: c511613bb7ca22fde222d9745f05c1153d92ad76fc830ee500bc755fca72b67a
- after: 585587b0723ed8b4d848b6b33d4cfcb536512bb2066f915594cc4e4439b7044e

## 實測證據與重現

`node scripts/original-reuse/check-native-groups.cjs`

真實Electron四卡片Shift選取、原版群組按鈕、標題輸入、拖曳原群組標題、取消群組按鈕。確認建立不改任何卡片世界座標，群組移動四張卡片同量平移；保存並重啟後每個節點位置與parentId一致。取消群組後位置不變，再重啟確認不復活。臨時inkbridge-original-modules-group-*測試資料，未使用桌面profile。

`node --test tests/original-sections.test.cjs tests/database.test.cjs tests/persistence.test.mjs`：17項通過。原子回滾、ACK、失敗保留草稿、嵌套投影、孤立父引用不修改來源、父群組驗證。新增刪除/foreign-instance-parent檢查後重跑相關2項通過。

其他直接相關流程：check-native-multiselect-context、check-native-connections、check-card-toolbar-menu的before-clipboard子集。沒有全量桌面/效能/PDF匯出重測。

## 已知界線與舊資料

如果舊版已把相對座標寫入SQLite而沒有保存群組，僅靠這些記錄無法算回群組原點。新版本保留原記錄，以無父群組形式顯示孤立卡片，不會猜原位置、刪內容或修改正式資料。這不等於自動還原過去已跑位的位置。

已實測一般文字卡片群組及取消群組；巢狀群組的座標/循環檢查有單元驗證，混合影音/PDF與巢狀群組全UI操作尚未完整驗收。PDF匯出繼續暫緩。

啟動Start-InkBridge.bat。舊視窗正常保存關閉後重新啟動；本輪未強制關閉使用者視窗。回復程式可revert本次Git提交，不需刪除資料。舊版不會顯示新的section紀錄，故不應使用舊版繼續編輯新群組。
