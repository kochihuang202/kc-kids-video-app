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

## 每張白板固定網址、預設含子孫（2026-11-14，使用者決定）

- 選取：從未發布過的白板，打開分享視窗時子白板、孫白板預設全部勾選，可手動取消；已發布過的沿用上次的選擇。
- 按鈕：「發布到網頁端／更新發布」為主要藍色大按鈕，放在白板清單下方；圖片壓縮、進度與「更多選項」移到按鈕下面。
- 網址：每張白板一個固定網址 `/s/<編號>/`，編號＝網站＋工作區＋這張白板（與它被當成根白板發布時相同）。根白板的網址不變。
  - `share-site/_worker.js` 在每次發布時寫入 `aliases/<編號>`，指向「最近一次包含這張白板的發布」；打開子白板網址會轉到同一網址加 `?shareId=<白板>`，在那份發布裡從該白板開始閱讀，麵包屑與返回照常。
  - 最近那份發布被停用或已不含這張白板時，改用這張白板自己當根白板的發布；都沒有就是 404。
  - 這項改版前發布的分享沒有 alias：子白板的固定網址要在根白板再按一次「更新發布」後才有效；舊的 `?shareId=` 連結照常可用。
- 分享視窗清單上，已發布的每張白板有「複製網址」，複製該白板自己的網址；視窗中的網址列顯示目前白板的固定網址。
- 原版網址列的「複製」原本用瀏覽器剪貼簿（InkBridge 拒絕此權限），實際沒寫入卻顯示「已複製」；改走 InkBridge 剪貼簿（`__inkbridgeCopyShareUrl`），失敗時顯示錯誤。`check-panel-local.cjs` 驗證兩種複製，並在結束時還原使用者原本的剪貼簿文字。
- 驗證：`tests/share-board-urls.test.cjs`（本機 workerd/R2：三層白板各一網址、子白板 302、子白板改以自己為根發布網址不變、最近發布優先、停用與移除後的回退）；`scripts/web-share/check-panel-local.cjs`（真實 Electron＋本機 HTTPS 分享站：預設子孫勾選、發布按鈕在選項之上且為大按鈕、三張白板網址、子白板轉址、複製網址）；`npm run test:share` 27 通過；`check-panel.cjs` 離線模式通過。尚未部署到 https://inkbridge-share.pages.dev，需重新部署 Pages 才生效。

## 分享頁載入速度（2026-11-14，使用者決定）

量測（線上 inkbridge-share.pages.dev，壓縮後）：首次開啟約 29 MiB，其中思源黑體 13.3 MiB、Noto Color Emoji 7.7 MiB；原版字型管理（65857）在畫布繪製前會載入全部內建字型。閱讀器檔案原本是 `max-age=0, must-revalidate`，每次開啟都要逐一確認。FlexNote 1.1.70 的單一 HTML 匯出把同樣的字型與檢視器全部內嵌，不會更快（見 `FLEXNOTE_1170_HTML_EXPORT.md`），已決定不採用。

- **閱讀器版本化與長期快取**：`build-site.cjs` 以內容雜湊命名閱讀器 `reader/inkbridge-reader-<12 碼>/`，寫入 `reader/current.json`；同時保留舊名 `inkbridge-reader-v1` 與上一個雜湊版本（`private-share-site/reader-archive`），讓已開著的頁面不中斷。`_worker.js` 對雜湊版本回傳 `Cache-Control: public, max-age=31536000, immutable`；分享頁一律用 `current.json` 指定的版本（分享資料格式各版相同），沒有時用發布時記錄的版本。內容不變時雜湊不變，重新部署不會讓瀏覽器重新下載。
- **每份分享的精簡字型**（自行設計，原版無此功能）：發布或匯出時 `src/main/share-fonts.cjs` 以 HarfBuzz hb-subset（`harfbuzzjs` 1.6.4，MIT，可攜版一併打包）從思源黑體與 Noto Color Emoji 切出只含「這份分享的文字＋閱讀器介面文字（locale.json）＋常用標點符號」的字型，存成 `assets/font-<sha256>.otf/.ttf`，列在 share.json 的 `fonts`。典型大小：中文約 0.7 MiB，表情符號依使用量（沒有表情符號約 1 KB）。網站只接受 `assets/font-<sha256>` 命名、列在 `fonts` 的這兩種字型。
- `src/web-share/viewer.mjs` 讀到 `fonts` 後，畫布字型請求改用精簡字型，並補一段同名 `@font-face` 讓介面文字也用精簡字型；精簡字型沒有的字（例如在搜尋框輸入）由瀏覽器改用系統字型。舊分享沒有 `fonts`，照原本載入完整字型，按「更新發布」後才會使用精簡字型。
- 預估：首次開啟約 10 MiB（閱讀器與繪圖引擎約 9.1 MiB＋精簡字型）；第二次以後只需分享內容與圖片。
- 驗證：`tests/share-site-speed.test.cjs`（精簡字型大小與決定性、網站接受並提供字型、拒絕非雜湊命名或型別不符、current.json、雜湊版本長期快取而 v1 不長期快取）；`check-browser.cjs` 真實 Chrome 完整閱讀流程，未下載完整思源黑體與表情符號字型，中文與 ⚠️ 正常顯示；`check-panel-local.cjs` 桌面發布帶精簡字型；`npm run test:share` 29 通過；`check-panel`、`check-desktop` 通過。尚未部署。

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
  不把本機或模擬服務結果冒稱線上結果。標準索引stream測試約161秒，發布端RSS峰值233MiB，
  2792次心跳；這不是Worker isolate記憶體或跨設備速度承諾。
- 512MiB真實Cloudflare Chrome閱讀第3頁與Range通過，34次UI心跳；1131bytes小PDF
  第3頁也通過，小於分段尺寸時保留全檔讀取。PDF.js4.4.168原生loader配置按需Range，
  不自動預抓整份大PDF。原填大測試檔在xref前有巨大連續空白，lexer逐段掃描；保留
  `large-pdf-fixture.cjs` 的whitespace診斷選項，正常大檔測試改用正式索引的獨立stream。
- 真實Cloudflare Chrome：原生分頁、提示、圖片／圖庫、PDF第3頁、子孫跳轉、刷新、
  返回、導覽及拒絕未分享板；沒有外站請求或寫入。測試等待實際相機動畫穩定再點擊。
- 本機Chrome：獨立reader/data路徑、512px預覽→放大清晰圖、版本固定／替換提示。
- 尚未宣稱實體iPad驗收或所有使用者私有PDF、色彩配置、特殊BMP都可轉換；
  不適用圖片回退原檔。第一版不清除已發布歷史或附件。

私人收據：`release/share-live-acceptance.json`、`release/share-pdf-browser-acceptance.json`、
`release/share-small-pdf-browser-acceptance.json`、`private-original-editor/web-share-research/browser-result.json`。
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

## 交付與啟動

可攜程式基線commit `582e0cb8df4a`，版本0.6.0，buildId
`7a1bf9f7b1748c53ec4fc20d6af12ee5a857d6daeee53ae027d63a2b97dfb9c0`，releaseSequence16。
ZIP SHA-256：`80c9b836f0854f2ca6598306d3471e1dd26231c40f41807b618b2d40d1de351f`，233702406bytes。
後續驗收／啟動器commit不改此已驗證的runtime內容。

OneDrive交換根目錄的 `Start-InkBridge-0.6.0.bat` 會讀同名PS1/JSON，首次驗證ZIP與
所有程式檔，原子安裝到 `%LOCALAPPDATA%\Programs\InkBridge\InkBridge-0.6.0-582e0cb8df4a-9f00c8`。
之後直接開該本機程式，不以初始ZIP覆蓋已更新安裝。筆記仍在 `%LOCALAPPDATA%\InkBridge`。
不把工作SQLite放在OneDrive，不需要安裝Node，也不需每次手動解壓。

兩份真實簽章增量包已通過隔離PowerShell Stage：0.5.14→0.6.0及0.5.15→0.6.0，
驗證簽章、基底、解壓與每檔雜湊，沒有套用到正式程式。既有可攜版仍可按更新並重新啟動。
新版可攜包另在原始碼外啟動，使用包內Electron及實際WebP Worker，通過原生分享匯出。
啟動器另以真實ZIP及BAT驗證首次安裝、原檔／筆記保留、無ZIP重用及損壞拒絕，約22秒。
PowerShell5舊Expand-Archive對長路徑及`[locale]`例外，改用已檢查單根目錄的ZIP串流及
Directory.Move原子安裝；暫存清理只限自建.pending目錄。
從實際OneDrive入口又確認WindowsPowerShell5不可繼承PowerShell7模組路徑；BAT僅清除
自身PSModulePath並保留錯誤碼。測試刻意注入無效模組路徑仍可首次安裝。此電腦已由
實際OneDrive BAT執行NoLaunch，完成本機程式安裝，沒有啟動正式筆記。
