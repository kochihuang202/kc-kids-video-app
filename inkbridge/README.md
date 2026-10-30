# InkBridge 墨橋

自行撰寫的 Windows 筆記／無限白板專案。當前版本 **0.1.0 / M1**：Electron 45.1.0＋CanvasKit 0.42.0，沒有 FlexNote 程式或資料依賴。

## 執行

Node.js ≥22.12，Windows x64：

```powershell
cd inkbridge
npm ci
npm start
```

也可雙擊 `Start-InkBridge.cmd`。開發版只在 `%APPDATA%\InkBridge\Development\` 建立自己的 Electron profile／快取；M1 卡片在記憶體，關閉後不保留，SQLite 在 M2 實作。字型在執行時讀取 Windows 系統 Microsoft JhengHei，不把 Windows 字型散布進 repository。

## 操作與測試

- 新增卡片或雙擊空白處；點選並拖曳卡片；Delete 移除。
- 空格＋拖曳／中鍵／平移工具移動畫布；滾輪以游標為定點縮放。
- 右下角縮放、左側顯示全部；效能實驗室可切換 100／300／500 張測試場景與匯出測量。
- 測試場景切換會取代本次記憶體內容；不是持久化筆記。

```powershell
npm test
npm run package:win
npm run test:package
```

Windows 成品：`release\0.1.0-<build-id>\InkBridge-win32-x64\InkBridge.exe`，實際路徑及 EXE SHA-256 記在 `release\last-build.json`。每次建置使用新目錄，保留舊版。這是公開 Electron runtime 加上我們自己的原始碼，不需要 FlexNote 安裝。保留整個發行資料夾，不能單獨搬出 EXE。

## 原始碼

```text
src/main/        Electron 生命週期、隔離 renderer、限定本機資源 protocol
src/core/        資料模型、座標、空間索引、CanvasEngine、benchmark
src/renderer/    UI 與操作協調
tests/           模型 oracle＋實際 Electron 操作測試
scripts/         開發啟動、Windows 封裝
docs/            研究轉換規格、驗收、第三方來源
```

沿用與適配清單見 [FOUNDATION.md](docs/FOUNDATION.md)，本次實測見 [TEST_REPORT.md](docs/TEST_REPORT.md)。研究原檔與 11 項舊原型測試保留於 `../flexnote-assessment/`。
