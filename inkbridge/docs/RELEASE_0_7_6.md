# 0.7.6 HTML 拖入、渲染與完整資源分享

## 原版來源

核對已安裝 FlexNote1.1.70，ASAR SHA-256 55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b。完整移植白板拖放28416、卡片庫拖放61186、HTML helper78784、19281的完整WebsiteCard建構方法，以及主程序71891完整資源收集器。舊白板入口97101綁定新版完整handler，62429對應既有23407共享slice，不複製第二個store。

REA選定來源證據 ev_51b2a51731ff00bf061e10485c0bad3ac1c8b29ad66f6a7fd9d4e6bdea157e30；更早卡片庫證據 ev_48c7eecd2fce66dd11dcd051eb5af44779b2cba1934eb0308d4d5430212693d7。這是靜態來源分析，執行結果以下列實測區分。私有html-drop-research、html-page-source-receipt.json保存來源及雜湊，不將專有來源或私人筆記放入Git。

## 接合方式

- HTML使用原版WebsiteCard/raw模式，預設1200×760，沿用10764畫布與iframe、縮放及互動規則。完整頁面、CSS與JS交給瀏覽器渲染。
- 沿用71891的HTML屬性、srcset、CSS url/@import與JS相對import/require追蹤。公開cheerio固定1.1.2，與原版宣告相符；Babel相容函式、檔案系統及工作目錄由宿主綁定。原收集器的200檔、80MiB總量與25MiB單檔處理邊界保留。遠端資源仍需網路；動態組出的未被原收集器追蹤的路徑不宣稱能離線補齊。
- 資源串流、雜湊並原子落入既有CAS；htmlbundle記錄相對入口、各檔hash及MIME。來源移除後不依賴原路徑；metadata及分享圖無本機絕對路徑。空白CSS／JS可合法保存、快照及發布。
- 新卡片kind為html，沿用同一SQLite schema1及保存協調器，沒有SQL Schema遷移。兩台應更新至0.7.6後同步HTML資料。檔案引用全部納入既有不可變快照；附件未到齊或雜湊不符仍拒絕切換，不覆蓋其他未同步修改。
- 原版iframe sandbox保留，互動頁可用正常瀏覽器儲存；桌面flexnote://page.<hash>與宿主不同origin，沒有桌面preload。公開分享頁沿用原版同站互動規則，不包含本機或發布端權限。提議的廣泛CORS修改被自動審查拒絕後，最終未加入任何新CORS開放規則。
- 分享包／R2保留bundle內相對路徑，僅包含選定白板的HTML及相依資源；發布完成後原子切換。同網址更新可移除舊HTML資源；停用後新請求拒絕。

## 相關驗證

- 相關Node測試：HTML資源閉包、另一份隔離工作區完整快照還原、未選資料排除、缺資源不發布、本機真實workerd/R2、停用、附件／協定／快照／分享與目錄回歸。合計22項，21通過；未啟用與HTML無關的512MiB完整上傳壓力案例1項。
- 真實Electron：OS檔案拖放、中文含空白檔名、空白大寫CSS、CSS import、圖片、字型、JS module依賴與實際滑鼠點擊、輸入、移走原始目錄後重開、無新共享版本。原PDF拖放／閱讀／重開相關回歸通過。
- 真實Chrome離線包：完整頁面與互動、瀏覽器儲存、重新整理通過。
- 線上與最終封裝交付結果完成後記錄如下。
