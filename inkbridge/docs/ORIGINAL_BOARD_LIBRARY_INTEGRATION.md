# 白板總覽與卡片庫移植進度（2026-10-31）

這是已驗證的功能批次，**不代表所有白板與卡片庫功能已完成**。先查 FlexNote 原碼／REA，再重用完整模組及適配自有資料。

## 來源

原版 ASAR 僅唯讀取證，SHA-256：`d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1`。完整工廠與依賴在 Git 忽略的私人目錄。沒有執行原版 main、修改正式安裝、資料或設定。

| 模組 | 用途 | 原 factory SHA-256 |
|---|---|---|
|13177|白板頁面父元件|`72009637c5dd956d4a32e8c4ca5a27877cabef91824aa110ecd917ac4b36cdbd`|
|58476|分組總覽／管理|`6f997dff8ea5fcb72c3c67fcee58ced904192b7dd879bb7fe4ed59c3d4d69c28`|
|81633|白板卡片／選單|`c6ff28fb4a02b932ebebb99a75b8b732ee2528c0996fd6256a7f9e96e6cab63a`|
|57152|完整卡片庫／篩選／虛擬化|`c76ae02aa0f1d31b9ce5cf87add61af57d70d1db73520c20d7145ed88f216a3c`|
|84974|加入白板視窗|`0cffa6e802c70399dd18cd1941409f7cacefc9a5e3107ac7e548440ec44a282e`|
|55153|Toast／佇列|`f918a329c1a8ae28293f5cd2a2f78142640c57407f3d0014ac670b2f8eb66f85`|

完整編輯鏈：64744.nC → 76011.i → 75000.a → 51245.ZP → 73866。新增選單31167.TS；加入白板擺放／重複保護94700.sE；新增立即改名48626.n0。保留原 UI／邏輯，未另寫簡化頁面。

## 自有資料邊界與確認的行為

- original-catalog.mjs 將 contents／instances／meta 投影為原版 DTO。內容與白板實例分離。
- original-note-writes.mjs 串行處理 NoteCard 新增、編輯、備註、加入白板、軟刪除／復原。實例與原屬性同交易保存，ACK 後更新加入的 Canvas 節點。
- original-folder-writes.mjs 依原版 background 分組刪除契約生成交易。沿用既有 schema/meta，舊資料日期缺失保留 null。
- Coordinator key 包含 catalog kind，避免同 ID 的 metadata 與備註互相覆蓋；deleteCatalog 可取代 pending folder update。
- Modal 關閉前讀取實際 Lexical state，等待 compositionend 與 SQLite COMMIT ACK。75000 原500ms throttle 無 unmount flush/cancel；自有 host flag 改走同一原版 onChange，避免 trailing save，沒有固定等待猜保存。
- 原 refreshCardList 只更新既有項目；新增／刪除／加入白板／復原在 ACK 後發出原 flexnote:cards-changed 重載。
- 原版基本 tags OR、boards OR、兩組 AND；有效 advanced 條件取代基本 tags/boards。保留先按編輯時間取頁、再頁內排序的原版語意。「空筆記」只顯示空 NoteCard。
- 原版刪除卡片保留內容並移除白板實例；復原不恢復舊位置。
- 全部卡片已在白板且避免重複時，94700.sE 返回 no_instances_created；84974 保留視窗、顯示失敗 Toast。接入原版全域 Toast 元件使提示可見。
- 原版分組名稱 Enter 移至描述欄，離開整個編輯區才保存。測試依此離焦，不自行改互動。
- 新建白板帶 rename=1；原 breadcrumb 自動改名後 shallow replace 清 query。自有 router 保留此流程，不啟動原 Next page loader。

### 明確的安全差異

原版刪除分組移除 folder 並 trash 白板／引用；復原在 untrash 後讀取已不存在的 folder，會拋錯且孤立引用可能隱藏白板。InkBridge 刪除以同一交易完成，復原時缺失 folder 的引用維持 trashed，白板回根層。這是已確認缺陷的安全修正。

自有展示卡只在全新 revision=0 工作區建立；清空卡片後重啟不再塞入展示資料。

## 實際驗證

全部使用 temp 獨立 profile／SQLite／合成內容。未跑完整 suite、效能、封裝或原版 FlexNote 對照實測。

| 測試 | 結果 |
|---|---|
|database／catalog／query／persistence 四份測試|18/18；含交易回滾、metadata kind、獨立讀連線可見 ACK|
|check-library.cjs 真實 Electron|原版兩頁、中文編輯／ACK、獨立新增、搜尋、網格／列表、空筆記、刪除／復原、加入白板、重複保護／Toast、精確重啟、清空後不 seed|
|check-board-dashboard.cjs 真實 Electron|分組內新增／立即改名、inline 改名、取消刪除、分組刪除、根層復原、內容保留／精確重啟|
|既有 check-folders-trash.cjs|側欄分組／改名／新增／跨組拖曳／刪除復原／重啟通過|
|既有 check-compact-shell.cjs|Canvas 面積、原 UI／切換、排除功能、視窗尺寸、無 errors|
|既有 check-shell.cjs|導航／搜尋／縮放／分頁／保存／composition 等待／重啟；新增改名接入後再次通過|
|Patch 冪等|22 steps 重跑均 already applied；清除 own Canvas export 重複項並重建 registry|

中文 fill 只證明 Unicode 保存，不代表實體 Windows IME 候選視窗驗收。composition 等待另有既有自動化回歸。

## 未完成／不得冒稱支援

- 本批適配僅 NoteCard；PDF、圖片、影音、Mindmap、網頁等類型及完整附件生命週期未完成。型別選單存在不代表支援。
- 進階／預設篩選、虛擬化／跨頁、多選已載入原 UI；查詢規則有單元驗證，尚未逐項 GUI 驗收。原 preset 存在獨立 profile 的 localStorage。
- 標籤／屬性 CRUD、完整反向引用／關聯、內容歷史、匯出、收藏、永久刪除／清空回收站未接完。空 property/link DTO 是模型缺口。
- 總覽搜尋、列表切換、排序、DnD 尚需各自驗收；側欄拖曳不等於總覽 DnD。原跨組拖曳多次 service commit 的整體崩潰原子性未驗證。
- 同 hash 的81633 preview fallback 明確返回 null；自動白板內容縮圖未完成，須追原版生成／載入與變體，不自行畫示意圖替代。
- 多 folder 引用刪除／復原保留拒絕保護；歷史 tab stale-title fallback 待處理。
- AI、帳號、同步、線上備份、資料匯入、快捷鍵設定依使用者指示排除。

下一批仍先查原完整服務鏈，不因缺口而自行重寫簡化版本。

## 啟動／重建

使用 Start-InkBridge.bat，無需封裝 EXE。專屬 profile：private-original-editor/profiles/desktop。Git 只含自有邊界、patch、測試與文件，不含專有來源或私人資料。

來源資產依既有程序放妥後執行：

```powershell
node scripts/original-reuse/apply-integration-patches.cjs
node scripts/original-reuse/collect.cjs
node scripts/original-reuse/check-library.cjs
node scripts/original-reuse/check-board-dashboard.cjs
```

factory 改動後須 collect 才會更新 runtime registry。
