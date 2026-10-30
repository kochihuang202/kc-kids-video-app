# InkBridge 墨橋

自行撰寫的 Windows 筆記／無限白板專案。當前版本 **0.3.0 / 編輯核心重整**：Electron 45.1.0、CanvasKit 0.42.0、Lexical 0.53.0、Node 內建 SQLite，沒有 FlexNote 程式或資料依賴。M1 與 0.2.0 整合版原始碼、成品保留。

產品目標是盡可能完整拷貝／重用 FlexNote 的既有程式與細節，形成獨立可修改、可重建的產品。固定流程為「先確認來源與依賴，優先完整重用；黑盒先REA拆解，確實追不到先討論，不自行另寫一套」，詳見 [開發流程](docs/DEVELOPMENT_WORKFLOW.md) 與本專案 [AGENTS.md](AGENTS.md)。目前0.3.0的實際來源狀態仍以上述版本說明為準，規則更新不表示已完成原模組整合。

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
- 單擊文字位置進入單一 Lexical 行內編輯；標題從首個內容區塊推導。提供粗體、斜體、底線、Undo／Redo。點空白處或 Escape 離開。
- Enter 段落、Shift+Enter 軟換行與空段落共同保存／渲染；自動高度內容不使用隱藏內捲軸。舊版獨立標題與 body 會保留並適配，不清空原筆記。
- 輸入後自動提交本機 SQLite；Ctrl+S／保存按鈕可明確等待 Commit ACK。正常關閉會補存，失敗保留視窗。Ctrl+S 尚不建立快照。
- 空格＋拖曳／中鍵／平移工具移動畫布；滾輪以游標為定點縮放。
- 右下角縮放、左側顯示全部；效能實驗室可切換 100／300／500 張測試場景與匯出測量。
- 測試場景使用獨立記憶體 model，不覆寫筆記；按「回到我的白板」返回。

```powershell
npm test
npm run package:win
npm run test:package
```

Windows 成品：`release\0.3.0-<build-id>\InkBridge-win32-x64\InkBridge.exe`，實際路徑及 EXE SHA-256 記在 `release\last-build.json`。每次建置使用新目錄，保留舊版。這是公開 Electron runtime 加上我們自己的原始碼，不需要 FlexNote 安裝。保留整個發行資料夾，不能單獨搬出 EXE。

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

本次編輯器依據、PRD 校正與已知差距見 [EDITOR_REBUILD.md](docs/EDITOR_REBUILD.md)。上述 M2_TEST_REPORT 是 0.2.0 歷史基線，不冒充 0.3.0 的效能或耐久結果。

M2 尚無 OneDrive、附件匯入、快照、歷史及搜尋 UI；不同白板共享 content 已在資料層驗證，UI 仍只有一板。IME 有 Chromium 組字協定測試，實體 Windows 注音／拼音仍待人工驗收。Canvas 富文本支援目前的基本文字樣式，沒有宣稱 DOM／Skia 的全部排版完全一致。
