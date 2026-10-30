# 公開依賴與來源

所有套件固定版本並由 npm 官方 registry 安裝，完整來源／integrity 在 package-lock.json。沒有使用 FlexNote 擷取出的 runtime、CanvasKit WASM 或 native SQLite 模組。

| 套件 | 版本 | 授權／來源 |
|---|---|---|
| Electron | 45.1.0 | MIT；electron/electron，發行包仍包含其 LICENSE 與 Chromium notices |
| canvaskit-wasm | 0.42.0 | BSD-3-Clause；Google Skia，使用公開 npm 的 full build |
| @playwright/test | 1.64.1 | Apache-2.0；Microsoft Playwright，僅開發／測試 |
| @electron/packager | 20.0.0 | BSD-2-Clause；electron/packager，僅建置 |

Windows 系統字型只於本機讀取使用，沒有複製進程式碼或發行包。程序化山景是自寫 CanvasKit 幾何繪圖，不是外部圖片。
