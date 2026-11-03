# 新連線預設 Bézier 曲線

2026-11-03 使用者要求：三種樣式中間的曲線作為新連線預設，不要每次手動調整。此為新連線政策；不批次改動既有連線。

## 先查原版

沿用目前 InkBridge 私人來源庫，未重新執行完整 REA、未讀寫正式筆記。原版主白板父元件 `48626` 傳入 `connectionDefaults`，包含 pathType、strokeWidth、color、endArrow、endArrowType、labelFollowPath。模組 `19281` 的 userTempBehavior 初始 pathType 為 bezier，工具列 `32627` 的三個選項依序為 straight、bezier、smoothStep；工具列選擇也會記錄 userTempBehavior。Canvas `10764` 的正常拖曳建立與預覽讀 connectionDefaults；缺少時會使用 orthogonal。

InkBridge 的 board.mjs 已接真正的 Canvas 與工具列，但未傳 connectionDefaults。隔離真實拖曳重現：SQLite pathType=orthogonal，新增曲線預期測試失敗。故修正父元件契約即可，不重寫曲線演算法、不覆蓋既有資料，也不必改動原版封裝或私人原模組。

處置：接回原版父元件的設定，pathType 固定 bezier，以遵循使用者指定的新連線預設；粗細、顏色、文字沿線設定沿用原版 userTempBehavior。修改單條舊線仍使用完整原版工具列與 SQLite adapter。這裡刻意不讓「改舊線的樣式」改變下一條新線的曲線預設。

私人來源內 `_app-504fc5b62d4836de.js` 的原版 factory SHA-256：

- 48626：4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de
- 32627：8701fe0990c52c322ae4260f9da21d340860255c0f65d0fb8e2ab83f6d3a1f03
- 10764：ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6
- 19281：3c5fc6c78622e77be960c57d82463d17111eff3581b740898a7f5d72e19dd355

## 定向驗證

`node scripts/original-reuse/check-native-connections.cjs`：修正前新增預期確實失敗；修正後真正的工具列連線模式、滑鼠端點拖曳、Canvas/SQLite pathType=bezier、手動改直線、重開保留、再新增仍為 bezier 均通過。原有箭頭、顏色、follow-path、反向引用方向、刪線與移除卡片級聯測試亦通過。只執行這個連線流程，未重跑無關全套。

未變更原版特殊快速建立／思維導圖內部的專用路由；本次針對畫布工具列的普通連線建立及樣式選單。

## 增量交付

0.5.1／發布序號 2，從已交付的 `InkBridge-0.5.0-eb9b4a26f3f8-7c0531` 產生。releaseId `8b83f365-9a02-4305-8b14-34c6bc68de64`，122,720 bytes、4 個變更檔案（board.mjs、app/package.json、使用說明及 portable Manifest）。真實 Windows helper Stage 已驗證簽章、ZIP 及逐檔雜湊；包與描述檔已放進指定 OneDrive 根目錄並核對複製內容。使用者的 0.5.0 可攜版啟動或回到前景後，可按「更新並重新啟動」。不是 0.5.0 這個基底的舊版本不會強行套用。

本次不重跑上輪已完成且未改動的更新器完整端到端套件；更新器本身未改動，曲線行為由真實 Electron 連線定向測試驗證。此電腦程式或另一台電腦的正式資料未自動替換。
