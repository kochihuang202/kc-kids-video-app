# InkBridge 墨橋

**目前啟動入口：雙擊 `Start-InkBridge.bat`。** 這是直接使用原版編輯／渲染模組的原始碼移植預覽，不需要新EXE。可修改原碼、重組裝方式、已驗證流程及未完成項目見 [原模組移植進度](docs/ORIGINAL_PORTING_PROGRESS.md)。原始來源與試用資料保留在本機private目錄，不推送公開Git。

下列0.4.0是保留的自製歷史底座，已停止擴寫，不能當作FlexNote功能重製已完成；見 [凍結紀錄](docs/EDITOR_RICH_TEST_REPORT.md)。

獨立的 Windows 筆記／無限白板專案。當前版本 **0.4.0 / 標準富文本整合**：Electron 45.1.0、CanvasKit 0.42.0、Lexical 0.53.0、Node 內建 SQLite，沒有 FlexNote 程式或資料依賴。M1、0.2.0 與0.3.0原始碼、成品保留。

產品目標是盡可能完整拷貝／重用 FlexNote 的既有程式與細節，形成獨立可修改、可重建的產品。固定流程為「先確認來源與依賴，優先完整重用；黑盒先REA拆解，確實追不到先討論，不自行另寫一套」，詳見 [開發流程](docs/DEVELOPMENT_WORKFLOW.md) 與本專案 [AGENTS.md](AGENTS.md)。本版直接重用官方Lexical節點及互動handlers；Canvas適配器仍是InkBridge程式，不代表已完整移植FlexNote編輯器。來源與缺口見 [來源確認](docs/EDITOR_SOURCE_CONFIRMATION.md)。

## 執行

Node.js ≥22.12，Windows x64：

```powershell
cd inkbridge
npm ci
npm start
```

也可雙擊 `Start-InkBridge.cmd`。M2 使用 `%LOCALAPPDATA%\InkBridge\Workspace\inkbridge.sqlite3`，Profile／Session／Logs 同樣位於自己的 InkBridge 根目錄。舊 M1 的 Roaming profile 保留；測試使用新的隔離暫存目錄。執行時讀取 Windows 系統字型，不將系統字型散布進 repository。

## 操作與測試

- 新增卡片或雙擊空白處；點選並拖曳卡片；Delete 移除。
- 單擊文字位置進入單一 Lexical 行內編輯；標題從首個內容區塊推導。提供粗體、斜體、底線、刪除線、行內code、Undo／Redo。區塊選單可轉標題1–6、清單、待辦、引用、程式碼；表格按鈕插入3×2表格。點空白處或 Escape 離開。
- 真正HTML貼上的標題、清單、code、連結、表格保留語義並保存／重開；程式碼Tab縮排與高亮、表格Tab跳格由官方套件處理。Markdown自動轉換、26自訂節點與完整進階選單仍待整合；已知不支持的富HTML會先提示拒絕，不偷偷攤平。
- Enter 段落、Shift+Enter 軟換行與空段落共同保存／渲染；自動高度內容不使用隱藏內捲軸。舊版獨立標題與 body 會保留並適配，不清空原筆記。
- 輸入後自動提交本機 SQLite；Ctrl+S／保存按鈕可明確等待 Commit ACK。正常關閉會補存，失敗保留視窗。Ctrl+S 尚不建立快照。
- 空格＋拖曳／中鍵／平移工具移動畫布；滾輪以游標為定點縮放。
- 右下角縮放、左側顯示全部；效能實驗室可切換 100／300／500 張測試場景與匯出測量。
- 測試場景使用獨立記憶體 model，不覆寫筆記；按「回到我的白板」返回。

```powershell
node --test tests/rich-document.test.mjs
npx playwright test rich-paste.spec.cjs
npm run package:win
npm run test:package
```

Windows 成品：`release\0.4.0-<build-id>\InkBridge-win32-x64\InkBridge.exe`，實際路徑及 EXE SHA-256 記在 `release\last-build.json`。每次建置使用新目錄，保留舊版。這是公開 Electron runtime 加上InkBridge原始碼與開源依賴，不需要 FlexNote 安裝。保留整個發行資料夾，不能單獨搬出 EXE。

## 原始碼

```text
src/main/        Electron 生命週期、限定 IPC、SQLite worker／schema
src/core/        資料模型、座標、空間索引、CanvasEngine、benchmark
src/editor/      公開 Lexical 整合與可等待 flush
src/renderer/    UI 與操作協調
tests/           模型 oracle＋實際 Electron 操作測試
scripts/         開發啟動、Windows 封裝
docs/            研究轉換規格、驗收、第三方來源
```

沿用清單見 [FOUNDATION.md](docs/FOUNDATION.md)。[M2 架構](docs/M2_ARCHITECTURE.md)、[本次驗收](docs/M2_TEST_REPORT.md)、[Gemini 五項處置](docs/GEMINI_M1_DISPOSITION.md)；[TEST_REPORT.md](docs/TEST_REPORT.md) 為保留的 M1 歷史基準。研究原檔與 11 項舊原型測試保留於 `../flexnote-assessment/`。

編輯器0.3.0依據見 [EDITOR_REBUILD.md](docs/EDITOR_REBUILD.md)，本輪見 [來源確認](docs/EDITOR_SOURCE_CONFIRMATION.md) 及 [0.4.0實測](docs/EDITOR_RICH_TEST_REPORT.md)。M2_TEST_REPORT 是0.2.0歷史基線，不冒充新版效能或耐久結果。後續按實際修改範圍選相關測試，不每次全測。

M2 尚無 OneDrive、附件匯入、快照、歷史及搜尋 UI；不同白板共享 content 已在資料層驗證，UI 仍只有一板。IME 有 Chromium 組字協定測試，實體 Windows 注音／拼音仍待人工驗收。Canvas 富文本支援目前的基本文字樣式，沒有宣稱 DOM／Skia 的全部排版完全一致。
