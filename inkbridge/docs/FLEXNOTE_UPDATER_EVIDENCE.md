# FlexNote 更新機制：針對性唯讀查證

查證日期：2026-11-03。使用者確認昨天已更新，因此本次安裝品為 **1.1.66**，不冒稱先前 1.1.65 的同版證據。沒有啟動原版、下載更新或改寫正式設定。

## 來源與覆蓋範圍

- 原版 `resources/app.asar` SHA-256：`18f370a6ee9ffa1b26191e340a9a6a6226bcef94cee9a9b7865800f82d84bbca`。
- REA 限定 `package.json` 與 `app/background.js`，parent Evidence：`ev_af396d18628f1bf7984803b106d4f9dfaf3b9321e500a5d3b555b4d0054bcc20`；summary Evidence：`ev_672d6f270a255532bb921dd20a9bd2788563b2cc461c6913ac4dd09e698f0b4c`。圖形語意覆蓋有上限；靜態呼叫不代表實際網路請求已被觀測。
- 對更新套件的相關檔案另作唯讀字元定位。沒有把原版主進程、專有模組或完整封裝提交到 Git。

## 已觀察到的呼叫鏈

| 問題 | 原版證據 | 結論 |
|---|---|---|
| 如何發現更新 | `resources/app-update.yml`：generic provider、`https://cdn.myflexnote.com/`、cache `flexnote-updater`；`background.js` 啟動配置呼叫 `checkForUpdates()` | 啟動向設定的版本來源查詢，不依使用者筆記資料庫判定 |
| 如何通知 | background 字元位置約 632555：`autoDownload=false`；監聽 update-available、update-downloaded、download-progress、error 並送至 renderer | 查版本、下載、安裝是分開的階段；實際 UI 是否還有額外自動觸發須另查 renderer |
| 使用者操作入口 | background 約 215938：checkUpdate/downloadUpdate/installUpdate 三個 IPC，分別接 checkForUpdates/downloadUpdate/quitAndInstall(true,true) | 可核對的真正入口，不是假定 API |
| Windows 如何換程式 | `electron-updater/out/main.js` 在 win32 建立 NsisUpdater；NsisUpdater.doInstall 建立 --updated、/S、--force-run 等安裝器參數 | 下載後執行 Windows 安裝器，再重啟；不是直接把任意 ZIP 覆蓋程式目錄 |
| 是否支援增量 | NsisUpdater 呼叫 differentialDownloadInstaller，回傳需 fallback 時改用 httpExecutor.download；其後呼叫 verifySignature | 有套件提供的差分下載路徑及完整下載備援；不代表昨天那次真的使用差分 |
| 程式碼能否重用 | 封裝內 electron-updater 實際版本 6.6.2，package license MIT | 此公開套件可評估直接採用；與 FlexNote 專有主進程區分 |

## 可重現檔案身分

| ASAR 內檔案 | SHA-256 |
|---|---|
| app/background.js | 88edba8f6eaab433a28f4c572f0879d078a3ecf11de1864e033808a1ba475ad7 |
| node_modules/electron-updater/package.json | 6f6633a142dbb92cea4099650112ac3d162dc841e6fd55c0cab2020bb5f51230 |
| node_modules/electron-updater/out/main.js | 577a4ec8ec6e1f62771c1ef5dacb09d507b3fc4cb1ccf44b02183bada0bdc7e9 |
| node_modules/electron-updater/out/providers/GenericProvider.js | c0d1f1aed62d7418e4d292118b3e079f9680914c554fe7604786b73771297d8a |
| node_modules/electron-updater/out/NsisUpdater.js | aafa536ffd84880f8d32bef8dfecf3f592fed0b969e743397ad8c064b04922a5 |
| node_modules/electron-updater/out/AppUpdater.js | f33534f53e10b00b823bf6e044614fc4d6cf1c6c54d748215362a567b2f35d55 |

## 對 InkBridge 的處置

沿用已確認的「檢查 → 通知 → 驗證下載 → 保存 → 外部程序替換 → 重啟」生命週期。此次使用者明確指定可攜 BAT、OneDrive 唯一描述檔、逐檔 ZIP、RSA 簽章及健康回報回復；NsisUpdater 的安裝器契約無法直接套用到這個發布格式。因此保留已實測的可攜更新器，不為了使用相同套件改成 NSIS 安裝產品，也不接 FlexNote CDN。若日後改用安裝器發布，可優先直接採用公開 electron-updater，而非重寫其下載與安裝邏輯。

本次未抓取伺服器 live channel，未執行原版安裝器，未證明原版完整錯誤回復或健康 ACK。這些界線不由靜態套件名稱推定。
