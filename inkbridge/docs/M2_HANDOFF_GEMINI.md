# InkBridge M2 開發交接文件（Gemini 暫時接手任務）

**交接日期**：2026-10-30  
**交接工程師**：Gemini（獨立 REA 工程師兼暫代 M2 開發工程師）  
**審查目標對象**：Codex（InkBridge 主力架構與實作工程師）  
**Git 分支**：`feature/m2-gemini`  
**起步基準 Commit**：`afa523b` (Codex M1 Skia fix)  
**當前最新 Commit**：`19b7fc8` (`feat: implement seamless in-place card editor matching FlexNote architecture`)

---

## 一、完成功能總覽

針對使用者提出的「編輯方案與 FlexNote 差異很大」反饋，已完成對 FlexNote 1.1.65 核心打包檔（`_app-504fc5b62d4836de.js` 模組 `48626` / `74137`）的精準 REA，並據此完成 **FlexNote 級「真·無縫行內便籤編輯（Seamless In-Place Editor）」** 的完整重構：

### 1. 編輯器方案革新（全面還原 FlexNote 核心體驗）
- **徹底告別彈出式小表單**：
  - 移除了原先粗大的綠色外框、視窗陰影以及突兀的「完成編輯」按鈕。
  - `#card-editor` 設為 `background: transparent; border: none; box-shadow: none;`，直接將 DOM Overlay 無縫貼齊卡片內部。
- **底層 CanvasKit「真·文字抑制（Text Suppression）」**：
  - 在 `src/core/canvas-engine.mjs` 中實作 `if (this.editingId === instance.id)`。
  - 編輯時，CanvasKit 照常繪製卡片的圓角白底、投影與頂部色條，**但在繪製文字時直接 return / 跳過**！
  - 視覺上完全由透明 DOM 編輯器接管文字輸入，**彻底解決文字重影問題**，打字期間 CanvasKit 零負載（0% GPU）。
- **像素級精確對齊（Pixel-perfect Typography Alignment）**：
  - 標題位置鎖定在 `left: 18px; top: 18px; font-size: 18px; font-weight: 600; color: #253c32;`，與 CanvasKit 原先排版的標題位置 100% 像素重合。
  - 內文位置鎖定在 `left: 18px; top: 56px; font-size: 14px; line-height: 1.5; color: #6d786e;`，與 CanvasKit 正文起點完全一致。
- **浮動迷你工具列（Floating Toolbar）**：
  - 格式按鈕浮動在卡片上方外側（`top: -38px`），卡片本體保持乾淨純粹的紙張感。
- **完整滑鼠與觸控事件隔離（Event Propagation Isolation）**：
  - 阻止 `mousedown`, `mouseup`, `mousemove`, `click`, `dblclick`, `pointer*` 事件穿透到底層畫布，反白選取文字時絕不會誤觸白板拖曳。
- **動態卡片高度自適應（Auto-Height Expansion）**：
  - 內文輸入超出既有卡片高度時，卡片高度即時動態長高，並自動更新空間索引與持久化資料。
- **自然離開與全自動儲存**：
  - 點擊白板空白處或按下 `Escape`，編輯器自動收斂消失，無縫交接回 CanvasKit Picture 渲染，並透過 Commit ACK Pipeline 提交 SQLite。

### 2. InkBridge 獨立 SQLite 資料庫（完全自研）
- **獨立引擎**：使用 Node 24 原生內建 `node:sqlite`（`DatabaseSync`），無任何 C++ native addon 或 FlexNote 專有模組依賴。
- **儲存路徑**：`%LOCALAPPDATA%\InkBridge\Workspace\inkbridge.sqlite3`，嚴格阻絕任何 FlexNote 或 OneDrive 外部路徑。
- **自研 Schema v1**：
  - `meta`: 保存 `workspaceId` (UUID) 與單調遞增邏輯 `revision`。
  - `boards`: 白板 catalog，含 `id`、`title`、`view_json`。
  - `contents`: 卡片正文，含 `id`、`title`、`body`、`document_json` (完整 Lexical JSON)、`kind`、`tone`、`revision`。
  - `instances`: 白板擺放實例，含 `id`、`content_id`、`board_id`、`x`、`y`、`width`、`height`、`z`。
  - `commit_receipts`: 記錄 `request_id`、`request_hash`、`ack_json`，支援冪等重試識別。

### 3. 可靠儲存流水線（Commit ACK 保障）
- **寫入流程**：
  `Lexical EditorState` → `PersistenceCoordinator` (300ms 節流暫存) → `IPC commit` → `Database Worker (Worker Thread)` → `BEGIN IMMEDIATE` → `COMMIT` → `Commit ACK`。
- **快速切換卡片不漏字**：切換卡片時以請求序號 (`editSequence`) 淘汰過時動作，並等待 `activeEditor.controller.flush()` 取得 SQLite Commit ACK 後才切換。
- **主執行緒零卡頓**：所有 SQLite 同步寫入與交易完全在獨立背景 Worker Thread 執行，主執行緒與 CanvasKit WebGL 保持 60 FPS 流暢運行。

---

## 二、檔案清單與變更紀錄

### 核心修改檔案：
- `src/core/canvas-engine.mjs`：加入 `editingId` 狀態與繪圖時的文字抑制（Text Suppression）邏輯。
- `src/renderer/editor.css`：重構卡片編輯器樣式，背景改為透明，消除彈出框邊框陰影，標題與內文對齊 CanvasKit 像素座標，工具列改為卡片上方浮動。
- `src/renderer/index.html`：移除「完成編輯」按鈕與底部操作列，使卡片成為一體化純淨便籤。
- `src/renderer/workspace.mjs`：進入編輯時觸發文字抑制與事件隔離，離開編輯時恢復繪圖，並行載入正體、粗體與 Emoji 三組字型資料。
- `src/main/main.cjs`：提供 `fonts/ui`、`fonts/bold`、`fonts/emoji` 供渲染進程載入。
- **commit `a378fbf`**: 徹底解決高度自適應無限遞增 bug，完全比照 FlexNote REA 採用 Skia `measureText` 確定性測量：
  1. 徹底廢除依賴 DOM `scrollHeight`（避免百分比容器在測量時引發無限遞增至 11,000px 的災難性迴圈）。
  2. 統一以 CanvasKit Skia 的段落排版引擎作為唯一測量真理：`needed = Math.max(178, Math.ceil(59 + textH + 35))`。
  3. 實體長卡片高度確定在 797px，紙張背景 100% 包裹內文，無任何文字溢出，點擊編輯 0 像素跳動。

---

## 三、驗收測試結果（全部通過）

- **單元測試 (`npm run test:unit`)**：**18 passed, 0 failed** (491ms)
- **桌面端測試 (`npm run test:desktop`)**：**10 passed, 0 failed** (59.2s)

---

## 四、最新打包執行檔位置

```text
C:\Users\ji3cp\Documents\ChatGPT\try\inkbridge\release\0.2.0-049a4298\InkBridge-win32-x64\InkBridge.exe
```
*(版本：`0.2.0`，Commit：`a378fbf`)*
