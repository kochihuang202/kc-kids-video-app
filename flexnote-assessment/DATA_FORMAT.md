# 快照／共享不可變附件格式與恢復契約

日期：2026-10-30。保留原SQLite權威儲存，不以Markdown/JSON取代Knex。OneDrive交換區只有snapshots/及共用assets/，不上傳進度監控、不共寫latest指標。下面標明原型已實作與正式整合待辦。

## 目錄（原型已實作）

```text
exchange/
  snapshots/<workspaceId>/<UUID snapshotId>/
    database.sqlite3
    manifest.json
  assets/<sha256前兩碼>/<sha256>.<小寫ext>

各機本地，不同步：
  working/db_<workspaceId>.sqlite3
  working/files/...
  state.json
  staging/...
  rollback-.../
  load-intent.json
```

snapshot UUID與電腦來源分開；時間不當ID或勝負依據。每個snapshot目錄只建立一次。資產原始bytes不轉碼，同hash/ext重用；內容改變產生新路徑，舊版本繼續存在。第一階段所有snapshot、asset、失敗staging均不自動清理，沒有GC。

本機state.json記目前base snapshot及最後完整fingerprint，不是OneDrive共享latest。原型另要求working/isolated-prototype.json標記，拒絕把一般目錄當測試工作區；沒有正式安裝／接管命令。

## Manifest v1（已實作欄位）

```json
{
  "formatVersion": 1,
  "workspaceId": "synthetic-workspace",
  "snapshotId": "UUID",
  "sourceComputerId": "computer-A",
  "createdAt": "ISO-8601 UTC",
  "parentVersionId": "UUID or null",
  "reason": "ctrl-s / timer / before-load / close",
  "appVersion": "1.1.65",
  "sqliteVersion": "3.44.2",
  "schema": {"fingerprint": "SHA-256", "migrations": []},
  "database": {"path": "database.sqlite3", "sha256": "SHA-256", "bytes": 123},
  "assets": [
    {"fileId": "id", "logicalPath": "files/source.png", "objectPath": "assets/ab/<hash>.png", "sha256": "SHA-256", "bytes": 456}
  ],
  "fingerprint": "SHA-256 of database hash and asset bindings"
}
```

上例UUID/SHA/bytes為說明佔位，不是可載入的實際manifest。schema fingerprint由sqlite_master定義產生，migration列表獨立記錄。原型拒絕不同app/engine或不同當前schema的載入；不默默跑migration。

capture fingerprint涵蓋完整DB影像及排序後的asset綁定；不含每次都不同的snapshotId、建立時間與parent，所以不會因備份本身產生無意義新版本。全DB包括索引變化也會保守視為有變更；尚未實作正式userDataRevision／快篩。

## 建立一致性版本

正式協調器須先等待所有編輯器flush與已提交的持久化Promise，再暫停新的完整mutation與內部／附件寫入。僅await一條SQL或固定等待300ms不夠。

原型的capture在呼叫者提供的withBarrier內：flush → node-sqlite3 Backup API讀取工作庫並寫私人candidate → candidate integrity_check → 從candidate files表取清單 → 收齊資產、計hash並發布CAS物件 → DB副本寫入新UUID目錄 → manifest最後發布 → 更新本機state。

資產複製後重新驗證hash，既有同名CAS物件若損壞直接報錯，不覆寫。若失敗，前一代及local base保留。manifest已發布但state尚未更新時留下完整版本，rescan能發現，不用時間戳自動決定採用。

SQLite Backup API提供單庫一致性；資產和main.db對應metadata需要另受同一capture屏障保護。原型測試由合成flush/barrier callback提供，不等於原版已具備。正式版的不可變asset revision應在匯入／改寫時固定，長時間複製/hash應移worker；不可為縮短屏障而讓DB引用與原檔跨版本。

## 掃描與完整性

- 掃描是唯讀、可手動重做；不追蹤OneDrive上傳、不寫共享head。
- 檢查manifest格式／工作區／ID／版本、DB hash/bytes/schema及全部asset hash/bytes；另從DB files表交叉檢查清冊，不能靠一份漏檔manifest自己證明完整。
- 缺檔、manifest先到、availability callback回未下載：incomplete。hash或schema不符：本次invalid，重掃可重新判定，絕不刪掉該版本。
- graph按parent分類current/newer-in-chain/older-in-chain/branch；缺父節點時unknown-lineage，不把無法證實的鏈當最新。
- 來源電腦、時間顯示在清單，但不作分支勝負；父鏈不同的兩份均保留。
- Windows真實placeholder辨識尚未接入。原型availability hook與亂序檔案測試只驗證協定，不是實體OneDrive結果。

## 手動載入與還原

原型load：在同一序列／barrier中flush → 必要保護快照 → 重新驗證目標及所有必要資產 → staging以Backup API回建DB及原邏輯附件路徑 → integrity_check → closeWorking → 留load-intent與rollback → 換入staging → reopenWorking → 更新本機base。發生可捕捉例外會回復整個舊working及state。載入某分支後下一快照parent為所選版本，其他分支不動。

FTS5在隨附SQLite3.44.2的integrity_check需要可寫的臨時副本；原型只對candidate/staging開RW做驗證，正式來源與已發布snapshot都不因此開寫。不得把readonly FTS驗證錯誤當成資料已壞，也不能跳過完整性檢查。

原型未完成：原版連線／背景jobs／多視窗flush接入、真實跨磁碟切換、斷電後自動load-intent復原、正式catalog metadata套用、vec0重建及GUI。close/reopen只是介面；目前測試工作DB與附件同在隔離working，不假裝已驗證Roaming和外部附件根目錄的實際分離配置。

## main.db與原版格式

main.db保存spaces及syncConflictArchive等；8個空間庫靠spaces.id與檔名／spaceId相接。正式每工作區manifest還需同屏障擷取對應catalog和必要衝突歸檔，載入只套用該工作區，不整庫覆蓋其他空間。此catalog整合尚未在原型完成；9庫Backup實驗已證明每庫schema與完整DB影像可保存。

原生DB包含歷史、索引、所有未知欄位/BLOB，保留ID與跨板引用。vec0必須用相容擴充查詢／重建；不因前綴ai_就刪除AI對話、課程與進度等使用者資料。獨立原檔useLink／遠端URL需明確收集；原型對useLink拒絕標完整。

main.db與8個庫均標準SQLite可讀；原版實際Knex3.1.0、sqlite3 5.1.7、SQLite3.44.2，非分析工具的3.53.3。各庫migration數58／82／87不一，app版本不能代替schema檢查。

## WAL與備份規則

9庫現況均DELETE。隨附3.44.2在WAL＋並行write/checkpoint時有已知WAL-reset風險；原型拒絕WAL online，沒有在來源執行checkpoint或改journal。修補版本及條件見[SQLite官方WAL說明](https://sqlite.org/wal.html)，API一致性邊界見[SQLite Backup API](https://sqlite.org/backup.html)。

## 資料自主與備份

原生快照＋原檔是精確回復的基礎。完整語義JSON／Markdown匯出另作可攜保障，保留富文本樹、板座標連線、Mindmap階層、標籤／屬性、PDF/媒體位置、歷史、引用及未知欄位；Markdown不能表示的部分由JSON保留。此全格式exporter尚未完成，不把既有10,362列allowlist原型稱完整遷移。

OneDrive以外另留版本化備份。快照／asset沒有自動GC；以後若加入清理，必須先計所有保留分支、祖先、快照與載入中的asset引用，再處理未引用物件，不能按檔案年齡直接刪除。
