# 公開依賴與來源

所有套件固定版本並由 npm 官方 registry 安裝，完整來源／integrity 在 package-lock.json。沒有使用 FlexNote 擷取出的 runtime、CanvasKit WASM 或 native SQLite 模組。

| 套件 | 版本 | 授權／來源 |
|---|---|---|
| Electron | 45.1.0 | MIT；electron/electron，發行包仍包含其 LICENSE 與 Chromium notices |
| canvaskit-wasm | 0.42.0 | BSD-3-Clause；Google Skia，使用公開 npm 的 full build |
| @playwright/test | 1.64.1 | Apache-2.0；Microsoft Playwright，僅開發／測試 |
| @electron/packager | 20.3.0 | BSD-2-Clause；electron/packager，僅建置 |
| lexical、@lexical/rich-text、@lexical/history | 0.53.0 | MIT；facebook/lexical，使用公開 npm 套件、自寫整合 |
| esbuild | 0.28.2 | MIT；evanw/esbuild，僅建置編輯器 bundle |
| node:sqlite | 隨 Electron Node runtime | Node.js 內建 API，含 SQLite；無另裝 native addon |

Windows 系統字型只於本機讀取使用，沒有複製進程式碼或發行包。程序化山景是自寫 CanvasKit 幾何繪圖，不是外部圖片。

M2 並未直接沿用 FlexNote 的 Knex／sqlite3 模組、schema、CanvasEngine 或二進位。新資料庫與自行撰寫的交易協定獨立維護。公開 API 參考：[Lexical](https://lexical.dev/docs/getting-started/quick-start)、[Node SQLite](https://nodejs.org/api/sqlite.html)、[CanvasKit](https://skia.org/docs/user/modules/canvaskit/)。
