# InkBridge M1：研究轉為獨立實作

> 歷史M1紀錄。後續使用者已改為優先完整重用原模組；本檔舊有「不載入原JS／WASM」描述不適用目前移植工作。最新方向依AGENTS.md及ORIGINAL_PORTING_PROGRESS.md，保留本檔只供歷史追溯。

2026-10-30。產品是自寫 Windows 白板；FlexNote 只作研究對象。本目錄不載入它的 EXE、ASAR、JS、WASM、native addon、設定或筆記。已取消的複製版實驗工具保存在 `flexnote-assessment/private-retired-copy-experiment/`（Git 忽略），不是本專案依賴；私人候選包未啟動，也不視為 InkBridge 交付。

| 既有成果 | 處理方式 |
|---|---|
| 自寫 hash、路徑防逃逸、不可變 CAS、UUID／parent、分支分類 | 可沿用演算法與自寫程式；M3 再抽為與 schema 無關的套件 |
| SnapshotPrototype、11 項測試 | 保留原檔與已驗證結果；需替換原版 addon 依賴、files/catalog schema、flush/barrier、placeholder hook，不可原樣作為正式模組 |
| 九庫 native Backup 實驗 | 保留為「原生 SQLite 整體影像可保存相依資料」的研究證據；不代表新 schema 或新引擎已測過 |
| Gemini 審查／處置 | 沿用 parent graph、下載驗證、catalog 邊界與失敗回復等要求；原版 flush 接入問題不再是前置條件 |
| FlexNote CanvasEngine、Lexical adapter、Knex services | 僅作行為研究參考，不匯入專有實作或擷取 binary |
| InkBridge CanvasEngine、互動、索引、資料模型、生命週期 | 本次自行實作；資料 schema、編輯器保存協定由 M2/M3 設計 |

## 可追溯的 M1 規格

研究起點為既有 `FEATURE_MATRIX.md` L13/L14/L19 與 `ARCHITECTURE.md`。沒有重新分析整份程式。下列是我們的實作契約，不宣稱重現原版全部內部語義。

| 觀察／設計 | InkBridge 契約與驗證 |
|---|---|
| 白板有視圖轉換與可視範圍查詢 | screen = world × zoom + pan；DPR 只影響 backing store。負座標往返、游標定點縮放及實際拖曳測試 |
| 空間索引限制繪製候選 | 自寫 512 單位 uniform grid，物件覆蓋所有相交 cell；移動先移除舊位置，查詢 dedupe＋AABB。500 卡與暴力查詢 oracle 比較 |
| 縮遠降低細節 | 依卡片投影寬度分為 high ≥200、medium ≥110、low ≥65、其餘 skeleton。門檻按本版閱讀需求設計；不是複製原版縮放參數或等效效能證明 |
| Picture Cache | 自寫 bounded LRU，key 為 content ID／revision／大小／LOD；只錄局部座標，平移、拖曳與選取不重錄正文；selection 獨立疊畫。最多 256 個，evict/dispose 釋放 Skia 物件 |
| 列表及後台資料更新影響畫面 | 目前由 model revision＋requestAnimationFrame invalidation 控制；閒置不連續重繪。背景 jobs／多窗通知尚未實作 |
| 同卡跨白板 | content 與 instance 分離，instance 含 boardId／contentId／位置。模型測試驗證共享內容更新與獨立移動；M1 UI 只有一張白板 |
| UI 主執行緒成本 | M1 索引查詢、字形排版／picture 首次建立與 render/flush 都在 renderer thread；效能報告分 CPU＋提交及 RAF interval。尚無 worker、圖片解碼、PDF 或真實富文字排版 |

## 最小實作順序

1. **M1（本次）**：獨立 Electron＋CanvasKit WebGL、基本互動、裁切、LOD、picture cache、桌面與壓力測試、Windows executable。
2. **M2**：公開 Lexical＋自訂 SQLite schema；內容／instance 分離沿用，加入 IME、Undo、commit ACK 與重開驗證。
3. **M3**：適配自寫快照與 CAS；同一 coordinator 處理 Ctrl+S、10 分鐘、正常關閉；可信 revision 判斷無變更。
4. **M4**：OneDrive 不可變交換區、分支管理、手動載入與安全還原。
5. **M5**：Mindmap、PDF／真實圖片、搜尋、標籤及歷史；有量測差距時才補針對性 REA。

本次不宣稱已完成 Lexical、SQLite 或永久保存。未來匯入只讀使用者選定的備份副本，不能直接打開正式 FlexNote 活動資料庫。
