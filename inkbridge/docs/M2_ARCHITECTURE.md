# InkBridge M2：編輯器、交易與生命週期

2026-10-30。這是 InkBridge 自己的程式與 schema；不載入 FlexNote 模組或活動資料。M1 tag `inkbridge-m1-dff2d50`、原成品與基準保留。

## 最小資料流

```text
Lexical EditorState
  → 標準 JSON 序列化＋plain-text preview
  → renderer PersistenceCoordinator（暫存修改／合併）
  → 限定 IPC commit request
  → database worker：BEGIN IMMEDIATE → 驗證／prepared SQL → COMMIT
  → requestId＋workspace revision ACK
  → 顯示「已保存」
```

使用公開 Lexical 0.53.0；所有 @lexical 套件同版，Vanilla JS、不依賴 React。SQLite 使用公開 Electron runtime 的 Node 24 內建 `node:sqlite`，沒有 FlexNote 的 native addon 或 ABI 依賴，也沒有為此加入 Knex。同步 SQL 放在 worker，renderer/main 不執行資料庫交易。

資料在 `%LOCALAPPDATA%\InkBridge\Workspace\inkbridge.sqlite3`；自己的 Electron profile/cache 在同一產品根目錄的 Profile／Session。測試由獨立暫存根覆寫，不接觸一般工作區。既有非 InkBridge DB 會先唯讀辨識 application_id／schema，不會為辨識而改 journal。

## 自訂 Schema v1

| 表 | 責任 |
|---|---|
| meta | workspaceId、已提交 workspace revision |
| boards | 白板 ID、名稱、view JSON |
| contents | 內容 ID、標題、完整 Lexical JSON、plain body、kind/tone、內容版本 |
| instances | 獨立 ID、content_id、board_id、位置／尺寸／z-order；外鍵保護引用 |
| commit_receipts | requestId、payload hash、既有 ACK；支援同請求重試辨識 |

一份 SQLite 就包含此工作區的白板 catalog 與內容，沒有照搬 FlexNote 的九庫。相同 content 可由多個 board instance 引用；M2 UI 仍只有一張白板，資料層與測試已支援共享引用。刪除一個 instance 不刪其他引用或 content。

SQLite 使用 DELETE journal、synchronous FULL、foreign_keys ON。workspace revision 在有語義變更的交易中增一次；相同值不增版。注意 no-op request 仍可新增冪等 receipt，所以將來快照 dirty 必須依邏輯 revision／assets，不能只比檔案 hash 或 data_version。

## 保存協定

- 本機自動保存的 300ms 只決定何時發起請求。手動保存、Ctrl+S、完成編輯及正常關閉都會明確 flush，不等這個 timer。
- 編輯器若仍在 IME composition，flush Promise 等 compositionend；不把固定延遲當內容已完成。
- composition 完成後用公開 Lexical discrete update 收斂 pending state，再讀 EditorState。使用 `JSON.stringify`／parse 的標準 JSON 語義，省略 Lexical 可選的 undefined 欄位，不放寬 DB 驗證。
- Coordinator 合併同項修改，串行等待 worker 的真實 COMMIT ACK。提交中又輸入的內容留在 pending，繼續提交；保存失敗保留最新 draft，不用舊 batch 覆蓋新文字。
- requestId 驗證回應；baseRevision 防過期覆寫。同 ID 同 payload 回傳原 ACK，不同 payload 拒絕。逾時回報 outcomeUnknown，不假設交易沒發生。
- 正常關閉：阻止新白板操作 → editor flush → commit ACK → 關 SQLite worker → 關視窗。保存失敗或未取得確認時保留視窗，不假裝成功。10 秒 close timeout 是失敗回報界線，並非 flush 成功條件。
- 編輯器切換用同一 close Promise，並以請求序號淘汰過時的開啟動作，避免重複 dispose。
- 完整 Flush 要求串行排隊，不能只等當下那一筆 transaction：後來排入的保存不得在另一筆新 batch 還在提交時回傳舊 ACK。主程序關閉逾時會送含 requestId 的取消通知，恢復編輯，舊關閉回應晚到也不關視窗。

這裡 Ctrl+S 目前只提交本機 SQLite，不建立快照。M3 會在已 ACK revision 之後接 Snapshot Coordinator；OneDrive 與快照 GUI 不在 M2。

## 實作邊界

Lexical 編輯與格式化、Undo/Redo、title、位置及保存／重開已接通。Gemini 後續加入透明 DOM 行內編輯、編輯中抑制 Canvas 文字，以及 Skia 粗體／斜體／底線與系統 Emoji fallback；完整 rich JSON 保留供再次編輯，尚未把全部 Lexical 節點或 DOM 行距映射到 Skia。DOM editor 依 world→screen 與 zoom 對齊，不做不同白板／不同視窗的即時協作。

卡片建立／編輯時由應用層測量文字，明確更新 instance、空間索引與 pending transaction；繪圖、picture cache replay 及 LOD 切換不修改文檔尺寸。這修正了長卡片畫面高度 854、DB 卻是 178 的實際回歸，也保證 varied-size 壓測不被 render 偷偷改成另一個場景。

效能實驗室使用另一個記憶體 model。只有真正 documentModel 的變更可送 DB，壓測 500 卡不覆寫使用者的筆記；介面可回到原白板。未實作附件、搜尋、歷史版本 UI、匯入、跨裝置或斷電後 draft 救援。
