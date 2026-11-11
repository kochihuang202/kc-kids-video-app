# InkBridge 0.6.0：獨立分享

## 使用方式

白板右下角原生「分享白板」圖示開啟完整分享視窗；開啟視窗不會上傳。
首次僅選目前白板，可勾選子孫、全選或取消。按「發佈分享／更新分享」才公開。
同一網站、工作區、根白板沿用固定網址；不同分享互不影響。
原圖及本機保存不變，公開版本是獨立快照。新增子白板不會自行公開。
未勾選的子白板只留下「未分享」占位，不含其正文、縮圖或附件。

圖片預設清晰優先：JPEG WebP88、PNG/BMP無損；可切節省流量或逐圖指定無損。
動畫保留全部影格；不適用、超尺寸或轉換更大的圖保留原格式並記錄原因。
512px預覽配合原生可視圖片佇列，放大讀取清晰版。PDF保持原檔，上限512MiB。
更多選項保留離線網頁包，執行其中 Start-Web.bat；不要直接雙擊 index.html。

此電腦已設定專用網站 https://inkbridge-share.pages.dev 。另一台在已連線電腦的
分享視窗「更多選項」產生一次性配對碼，再填網站及配對碼。金鑰不隨OneDrive、
可攜包或資料快照傳送。停用分享會拒絕新的讀取，已下載的副本無法收回。
分享網址供持有連結的人閱讀，網站沒有公開分享列表。

## 已確認來源與接合

- `prepare-sharing.cjs`：完整46979.n2 Modal、78178.M父面板，原生子元件、按鈕、
  複製連結、更新時間及啟用狀態。只替換原帳號／服務端邊界及擴充選擇／轉檔設定。
- 原始factory指紋：46979 `cba922d999fccbb9b3df078b7b7e368262a6785adc15da51b67c2e2d978682f8`；
  78178 `dc7fb9273b90a4801e5cb134f97ac9f16b7c4b8378e93b5b51c41380df6bea04`。
  產生器保留private備份，驗證錨點與語法，再collect；原始專有factory不進Git。
- 閱讀器沿用原92570/48626/67259，Web variant僅改本機資源路徑、唯讀邊界、
  未分享跳轉及原生33158圖片快取的預覽解析。沒有桌面IPC、原廠帳號或原服務依賴。
- `share-coordinator.cjs`：短暫序列化所有視窗Flush／CommitACK、凍結、SQLite一致讀取，
  隨即恢復輸入。轉檔與上傳不占用保存佇列。世代IPC檢查沿用既有生命週期。
- `share-images*.cjs`：單一背景Worker、sharp/libwebp、內容與設定指紋快取。
- `share-client.cjs`、`share-site/_worker.js`：8MiB分段、兩段並行、持久續傳、
  R2原生SHA-256串流完整驗證；ETag只用於原子條件更新，不當內容雜湊。
- 不可變發布版本與附件完成後才切換current。另一台先發布時回409保留雙方；
  不以保存時間覆蓋。閱讀器固定版本，版本變更要求重載，避免混用附件。
- R2 `SHARE_BUCKET` 僅綁新私人bucket `inkbridge-share`。公開附件請求先核對
  分享啟用、目前版本及附件歸屬；撤除白板後舊網址不再供應其附件。
- 裝置金鑰由Windows/Electron加密，放在該userData/Profile；safeStorage的Profile
  金鑰不可直接複製到另一Profile。Electron45 async解密須取回傳物件的result。

## 實際驗證與界線（2026-11-12）

- 相關維護中測試：30通過、0失敗；大檔opt-in另跑，不用skip表示已驗證。
- 真實Codec8項：照片、文字密集圖、透明、BMP、EXIF、動畫、現成WebP、損壞快取。
- 範圍／匯出10項：子孫、重複／循環、未分享及產生縮圖不外洩；65MiB PDF串流。
- 真實Electron：512MiB PDF檔案拖入、SQLite/CAS、原生PDF閱讀第3頁、Range206、重開。
- 真實Electron分享：配對表單、子孫勾選、待存Lexical入庫、離線包、兩次原生發布，
  固定網址不變。測試工作區為合成資料，沒有打開正式FlexNote或正式筆記。
- 真實Cloudflare：512MiB PDF上傳／中斷後續傳、範圍讀取、固定網址更新、舊版本拒絕、
  配對一次性與停用新讀取。一次遠端非JSON錯誤曾中斷，已從同份紀錄續傳成功；
  不把本機或模擬服務結果冒稱線上結果。續傳那次約110秒，發布端RSS峰值223MiB，
  1851次心跳；這不是Worker isolate記憶體或跨設備速度承諾。
- 真實Cloudflare Chrome：原生分頁、提示、圖片／圖庫、PDF第3頁、子孫跳轉、刷新、
  返回、導覽及拒絕未分享板；沒有外站請求或寫入。測試等待實際相機動畫穩定再點擊。
- 本機Chrome：獨立reader/data路徑、512px預覽→放大清晰圖、版本固定／替換提示。
- 尚未宣稱實體iPad驗收或所有使用者私有PDF、色彩配置、特殊BMP都可轉換；
  不適用圖片回退原檔。第一版不清除已發布歷史或附件。

私人收據：`release/share-live-acceptance.json`、`release/share-pdf-browser-acceptance.json`
（後者以實際檔案存在及通過為準）、`private-original-editor/web-share-research/browser-result.json`。
發布驗收網址只含合成測試內容，不是使用者的正式白板。

## 重建與維護

在InkBridge專案執行 `npm ci`；重建私有原模組依既有source證據流程。
`npm run build:share-site` 產生忽略的 `private-share-site/deploy` 和專屬Wrangler設定，
包含原生閱讀器及_worker，排除合成share.json／附件／裝置金鑰。
從 `private-share-site` 執行 `wrangler pages deploy deploy --project-name inkbridge-share --branch main`。
該目錄自己的deploy config避免上層其他專案的Wrangler設定干擾。
後續白板發布只寫R2，不重新部署Pages。

初始發布金鑰由 `connect-publisher.cjs` 設定到明確指定的Windows Profile；
只把其SHA-256以無附加換行的stdin寫入Pages secret `BOOTSTRAP_TOKEN_SHA256`。
絕不輸出、提交或打包金鑰。重新部署不要重新產生金鑰，其他裝置使用一次性配對。

`npm run test:share` 為相關測試；`check-panel.cjs` 是真實桌面分享，
`check-browser.cjs` 可接受 `INKBRIDGE_WEB_URL` 驗證實際網站。
`check-cloud-live.cjs` 由Electron執行，明確opt-in512MiB；僅使用合成資料。
可攜建置沿用 `build-portable.cjs`，帶入sharp/bmp-js實際runtime依賴閉包，
不依賴另一台安裝Node.js。既有簽章增量更新通道維持使用。
