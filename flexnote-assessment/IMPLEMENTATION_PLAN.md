# 最小修改與原型里程碑

日期：2026-10-30。最新要求為保留原schema／Knex／白板、運行中按需快照及手動版本載入；不監控OneDrive上傳，交換區為snapshots/＋共用assets/。本輪已完成隔離資料安全原型，未修改原版或正式資料。

| 階段 | 交付／驗收 | 現況 |
|---|---|---|
| M0 資料庫與程式邊界 | 9庫用途／journal／migration、編輯器延遲、Backup API、引用／附件／索引相依 | 已完成本輪唯讀與靜態調查；不是完整runtime追蹤 |
| M1 隔離最小原型 | DB＋資產回建、無變更不重存、中斷前版安全、雙電腦分支保護 | 11項測試通過；9個真實私人DB副本native備份／回建通過 |
| M2 原版保存生命週期 | 全editor可等待flush、持久化Promise追蹤、完整mutation barrier、asset revisions、catalog擷取 | 未接入；這是接正式Ctrl+S前必要門檻，不改renderer或schema |
| M3 快照管理與本機交接 | 手動重掃、四種必要狀態及舊版／unknown chain、選版載入、staging/rollback、安全重開 | 原型已有掃描／load核心；GUI、Windows placeholder、真實OneDrive／多磁碟仍未驗 |
| M4 完整驗收與資料自主 | 原版混合板重開、歷史／搜尋／引用／跨窗、100/300/500基準、完整JSON/Markdown匯出、斷電恢復 | 尚未完成；不可把11項合成測試等同正式上線 |
| M5 Mindmap操作 | Xmind對照與Tab/Enter/IME/Undo焦點優化 | 保留後續，未改布局引擎 |

## 所需最小新增模組

1. **EditorPersistenceBridge**：向所有相關editor索取當前state並flush pending；補上可等待ACK與未完成KD Promise追蹤。200ms/300ms合併不是保存完成證據。
2. **SnapshotCoordinator**：合併Ctrl+S、每10分鐘、正常退出、背景／休眠best-effort請求；單一序列、固定capture revision，等待完整mutation/jobs及附件寫入，再開Backup API。仍有新編輯時保持dirty。
3. **SnapshotStore／AssetPublisher**：唯一UUID、parent、不可變CAS、manifest最後發布、hash／schema／catalog驗證。無共享latest、無自動合併、第一階段不清歷史或asset。
4. **SnapshotManager**：運行中手動重掃本機；顯示current/newer/older/branch/unknown-lineage和完整性，不查上傳進度。選版前先保護修改；正式首版建議受控重開程式，暫不做所有cache／連線的透明熱替換。
5. **RestoreCoordinator**：關閉相關pool／worker／媒體handle，staging驗證、rollback、load-intent及啟動恢復；保留其他工作區catalog與各機登入／裝置設定。

只新增這些整合邊界，不重寫Knex query builder、原schema、CanvasKit、culling、LOD、Mindmap layout或正常跨視窗通知。外部工具不能替原版做editor flush；正式hook接入與可維護授權方式尚待確認，原型不重用專有程式碼。

## 觸發與失敗政策

- Ctrl+S／10分鐘／正常關閉：flush後有未備份變更才發布；無變更不重存。初次沒有baseline視為尚未備份。
- 背景與休眠：安全時best effort，不阻擋休眠、不強制中斷中文組字；若未完成則恢復後重試，不宣稱完成。
- 任何快照／載入失敗不得覆寫其他UUID。manifest已發布但本機base未更新時，保留可掃描版本，不能自動當垃圾。
- 當前DELETEmode保留；3.44.2的WAL online fail closed。未來若改WAL，需修補並檢查所有連線，不只是換外部helper。
- A/B從同parent分叉均保留；手選分支為下一parent。第一階段不自動GC；將來也不能刪仍受分支或快照引用的祖先／asset。

## 下一個可驗收切片

先在原版的隔離測試工作區接入一個真實editor的flush/commit ACK及barrier，驗證輸入後立即Ctrl+S不丟最後文字、組字與多窗安全；再納入其他editor與內部job。資料層11項測試作保護網，既有原版核心不改。未證明這個切片前，不把timer掛到正式庫。
