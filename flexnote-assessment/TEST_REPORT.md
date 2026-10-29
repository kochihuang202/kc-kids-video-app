# M0/M1：資料庫、共享附件與版本分支測試報告

日期：2026-10-30。本輪只在隔離工作目錄及私人資料庫副本測試，未patch原版、變更正式設定或還原正式資料。原版ASAR調查前後SHA相同：d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1。

## 已完成的三類驗證

1. **正式資料唯讀調查**：9庫用途／schema／migration／journal。均DELETE；main.db的8個catalog ID均對應8庫，其中6工作區isTrashed，未刪任何資料。
2. **9個私人真實資料庫副本的native Backup實驗**：使用隨附SQLite3.44.2，source copy→snapshot→restored；9/9完整DB影像hash相同、schema相同、integrity_check=ok、source copy hash不變。包含歷史BLOB、FTS及vec0 shadow pages，不需逐列翻譯。
3. **共享asset／版本管理原型**：11項Node整合測試通過，最後一次11 pass / 0 fail，約4.63秒（合成小型資料，不是性能基準）。

## 11項原型測試

| 測試 | 結果與驗證內容 |
|---|---|
| 原生Backup API | 通過：sqlite_master／索引、正文、歷史BLOB、標籤、FTS查詢及同卡跨兩板ID一致，來源hash不變 |
| 無變更與共用資產 | 通過：重複Ctrl+S／timer／close請求不新增快照；只改DB時asset物件仍只有一份；交換根僅snapshots/assets |
| flush完成順序 | 通過：await模擬的延遲editor寫入後才備份，快照包含最後內容；不靠固定sleep |
| 舊版附件還原 | 通過：同邏輯路徑改內容產生兩個hash；載舊版恢復舊bytes及DB，新快照仍完整；載入後無變更不重存 |
| 發布中斷 | 通過：after-assets／after-database／after-manifest三處注入例外，舊版hash不變；未完成版不能載入，完整已發布版不刪 |
| 到達順序與壞檔 | 通過：manifest/DB先到、asset缺失為incomplete；placeholder callback為pending；齊全後complete；錯hash為invalid |
| A/B延遲分支 | 通過：A、B同V1各生V2；B較晚建立但A更晚送到，兩支皆保留；手選A前先保存B未備份修改，後續parent為A |
| 載入失敗回復 | 通過：after-swap注入例外，原工作DB、asset及本機state復原，當前未備份修改已留保護快照 |
| WAL保護 | 通過：隔離WAL來源在3.44.2被拒絕online backup，沒有擅改其journal模式 |
| 清冊漏引用 | 通過：即使重算manifest fingerprint，漏掉DB files所需附件仍被交叉驗證拒絕 |
| 不相容版本 | 通過：未知app版本拒絕載入，當前資料不變 |

這些是程式化故障注入／合成資料測試，不是真實斷電、實體雙電腦或OneDrive客戶端驗證。PNG樣本僅作原始bytes還原，沒有宣稱圖像解碼／白板渲染驗收。

## 9庫私人副本結果

| 別名 | bytes | schema objects | DB影像回建／integrity |
|---|---:|---:|---|
| catalog | 319488 | 10 | 相同／ok |
| W0 | 987136 | 216 | 相同／ok |
| W1 | 987136 | 216 | 相同／ok |
| W2 | 1019904 | 216 | 相同／ok |
| W3 | 89964544 | 224 | 相同／ok |
| W4 | 1019904 | 216 | 相同／ok |
| W5 | 987136 | 216 | 相同／ok |
| W6 | 483328 | 106 | 相同／ok |
| W7 | 1024000 | 224 | 相同／ok |

schema objects含tables/indexes等，與ARCHITECTURE表數不是同一指標。八個空間來源是前輪穩定私人副本；catalog另以標準SQLite read-only Backup API取得私人副本。這是逐庫API可行性，**不是9個庫同時點的完整工作區快照**。

## 工具及重現

- snapshot-prototype.cjs：自寫native wrapper及隔離SnapshotPrototype。由FLEXNOTE_SQLITE_BINDING指定私人擷取的原版node_sqlite3.node；不散布該binary或FlexNote程式碼。
- snapshot-prototype.test.cjs：Node內建test；FLEXNOTE_PROTOTYPE_OUTPUT指定私人測試輸出，working必須有isolated-prototype marker。
- audit-native-backup.cjs：讀私人sources.json，寫全新輸出目錄，驗9庫source不變／完整影像／schema／integrity。
- inventory_databases.py：mode=ro查正式庫metadata/journal/counts，不讀筆記正文或改journal。
- 原有probe_data.py／test_probe.py：8庫、268次allowlist表比較、10,362列JSON往返；1項Python整合測試先前通過，保留但不冒充全量遷移。

執行新測試：設定FLEXNOTE_SQLITE_BINDING為私人native addon絕對路徑，再執行node --test flexnote-assessment/snapshot-prototype.test.cjs。未提供binding則明確失敗，不偷換系統SQLite引擎。

私人證據根：C:\Users\ji3cp\.codex\visualizations\2026\10\29\01a1886a-23bf-75e2-85c6-b497ce388c5e。

- flexnote-nine-db-inventory.json：9庫用途／狀態／schema／migration與真實工作區ID映射。
- native-backup-audit-result/report.json：9庫native實驗摘要；snapshot/restored是真實私人內容，不提交Git。
- snapshot-prototype-tests：全部合成工作目錄、不可變assets、分支與故障輸出。
- flexnote-editor-persistence、flexnote-mindmap/module-slices：實際延遲／fire-and-forget函式與AST receipts。
- flexnote-reverse-boundaries-evidence.json與FEATURE_MATRIX的REA IDs：靜態逆向證據；partial coverage不等於全產品已證實。

## 遇到的問題及修正

最初8項測試因SQLite3.44.2的FTS5 inverted-index檢查嘗試在readonly candidate寫入而失敗；查看真實錯誤後，把integrity_check限於可寫的私人candidate/staging，正式來源維持readonly。沒有跳過FTS或弱化檢查，重跑11項全過。

先前REA整個background語義分析60秒timeout，改用AST小切片；有node上限／動態關係／未選依賴的partial限制。Python原型遇vec0虛擬表時明確排除該表的行級JSON轉換；本輪原生Backup不轉換schema，已保留全部DB影像。

## 尚未完成，不能當通過

- 真實原版editor／多窗／中文IME flush與commit ACK；原型flush callback不是原版實機結果。
- 正式全mutation／內部job／附件寫入屏障及capture revision追蹤；timer、Ctrl+S、正常退出與休眠hook均未安裝。
- main.db選定工作區catalog與syncConflictArchive的同屏障擷取／套用；原型目前只載入單工作DB＋受管files。
- 真實OneDrive／Windows placeholder／多磁碟還原、程序被殺／突然斷電後自動load-intent recovery、實際Knex多pool及媒體handle重開。
- vec0查詢／索引重建、完整Markdown／語義JSON匯出、遠端URL／useLink收集、原版UI重開及白板100/300/500性能。

因此M1第一批資料安全條件已有實證；還不是正式可部署同步器。WAL-reset的未重現不能作安全證明；現況DELETE且原型拒絕WAL online。官方條件與修補版本見[SQLite WAL說明](https://sqlite.org/wal.html)。

## 最小後續測試

接入一個真實editor後，立即輸入→Ctrl+S→載入副本應含最後字；中文組字中不截斷、不偽報保存。加入10分鐘／close／background/suspend請求合併與保存失敗測試。載入管理再驗真實OneDrive亂序／placeholder及受控重開。跨版本先在staging跑原版migration，舊snapshot保留，不默默降版。

渲染核心未改，後續只改manifest／外部restore時重跑這些資料測試及代表性原版重開；只有renderer/read model或載入相依改變才擴大白板回歸。首次原版與還原後按同硬體、固定100/300/500混合板記錄樣本數、範圍、中位數、p95、記憶體及長時間趨勢；目前沒有可宣稱的白板效能數值。

## Gemini第二階段審查核對（2026-10-30）

核對基線01f4036；詳見[GEMINI_DISPOSITION.md](GEMINI_DISPOSITION.md)。既有Node suite本輪重跑11/11通過，2815.3798ms；未重跑9庫實驗或完整REA，未啟動原版、改正式資料／設定，snapshot-prototype.cjs保持不變。

新增review-probes.cjs，僅對新建私人合成目錄使用隨附SQLite3.44.2，實驗全部斷言通過：

| 問題 | 本輪實測 | 限制 |
|---|---|---|
| data_version快速判斷 | writer自己commit仍1；持續observer 1→2；每次新開reader前後皆1 | 重新連線比較可漏變更；asset-only與未dispatch的合成記憶體狀態均不反映於該值 |
| 任意open必擋rename | Node fs.open持有時rename成功 | 不等於原版SQLite／worker的handle可安全熱換 |
| 禁止delete-sharing的實體鎖 | load拒絕EPERM；原working存在、DB hash不變、值仍preserve-this | 已有catch有效，但未證明原版pool已關閉、斷電恢復或所有失敗路徑 |

原始輸出在私人根gemini-review-probes/review-89BF8Z/report.json；既有suite新輸出在gemini-review-isolated-tests。重現probe須設定FLEXNOTE_SQLITE_BINDING及FLEXNOTE_REVIEW_OUTPUT，再執行node flexnote-assessment/review-probes.cjs。它不啟動FlexNote、不讀正式DB或設定，Windows鎖實驗只啟動隱藏的私人FileStream holder。

後續新增門檻：完整啟動隔離證明→一個真實editor的flush及commit ACK→包含直接Knex writer的屏障與dirty追蹤→同一流程接Ctrl+S／10分鐘。無變更的低I/O驗收應檢查backup/hash呼叫數，不僅檢查created=false。真實OneDrive placeholder與原版重開仍是未驗風險，不能以目前11項合成測試代替。
