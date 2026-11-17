# 0.7.7 HTML 完整交付與中文編碼

完整HTML來源、CAS、同步與分享架構見[0.7.6紀錄](RELEASE_0_7_6.md)。最終版另核對原版main50620的Kd檔案串流及Xd MIME函式：文字、JavaScript、JSON與SVG回應明確指定UTF-8。桌面協定、離線serve與R2同樣補齊，fixture刻意不放meta charset，驗證中文顯示。

原版iframe規則保留；獨立網頁包的閱讀器CSP仍由入口index.html的meta生效，避免將閱讀器的script限制錯套到使用者HTML。HTML內嵌及模組腳本、圖片、CSS、字型與瀏覽器儲存均有實測。原始HTML內的互動狀態依該網頁自己的儲存邏輯運作，不把表單狀態寫成共享筆記版本。

相關Node回歸22項中21通過，未啟用既有512MiB上傳壓力案例1項；後續HTML匯出／範圍／完整性11項通過，UTF-8與協定案例另通過。真實Electron與Chrome驗證、兩份隔離工作區的附件快照還原均通過；未操作另一台實機。

公開cheerio依賴閉包納入可攜包；封裝檢查僅精確放行htmlparser2／parse5公開Tokenizer與token程式檔，其餘私密檔拒絕仍保留。封裝版另外實測由自身匯出分享包，避免只在開發目錄可用。

## 最終交付（2026-11-17）

- 封裝版 37d427bf0b67，發布序號28，build ID 2b248f2113f4d2a6a76ee7911cdd714f38d5c566cc53527ebe1797ebab15fba8。無charset中文、inline JS、模組、CSS／圖片／字型、實際點擊輸入、來源移除後重開及無瀏覽增版均通過；同版程式自身匯出的離線包再由Chrome驗證通過。
- Cloudflare正式專用網站 https://inkbridge-share.pages.dev 已部署；最終部署93c568cc，閱讀器inkbridge-reader-e820f0afa63d。合成HTML實際發布、Chrome互動、同網址內容更新、舊資源移除及停用後404通過。測試分享已停用；正式筆記未上傳。
- 完整ZIP InkBridge-release-0.7.7-a82e3a1c-6a54-4d4a-8ae5-25f60f2bf6dc.zip，235175179 bytes／3535檔；SHA-256 9af87fd0cb1f240f6d03c76f42e6933921f8fa684f502520c2078ac156af785c。
- 0.7.5直升ZIP InkBridge-update-ec829831-c070-4814-a39a-8c207235ae26.zip，11483728 bytes；SHA-256 dcd6b39c4a42f156e7d2ad2a23e364b4cc0cfb3286d59ecde685eb6077f7af75。
- 0.7.6直升ZIP InkBridge-update-d06bec3f-c36b-44be-a6ed-a145c9cce264.zip，172469 bytes；SHA-256 f58b04a507db90bd3890cb6155fa666ffeb2fa77a576b54093f8d1813b5a22ec。
- 三包RSA簽章及所有檔案雜湊通過，兩條隔離PowerShell Stage通過且基底程式未改。完整ZIP可直接安裝最新，不必逐版解壓。
- 已放入指定OneDrive交換根目錄並核對，舊完整包清除，只留0.7.7完整ZIP；資料快照、附件與診斷保留。收據release/delivery-0.7.7.json。這確認本機OneDrive資料夾的檔案，不代表已驗證另一台的OneDrive下載完成。
- 兩台都更新到0.7.7；解壓完整ZIP到本機程式目錄後執行Start-InkBridge.bat，或從0.7.5／0.7.6程式內直升。只在ZIP內交付啟動BAT。
