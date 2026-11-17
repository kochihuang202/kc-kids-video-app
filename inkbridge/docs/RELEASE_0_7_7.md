# 0.7.7 HTML 完整交付與中文編碼

完整HTML來源、CAS、同步與分享架構見[0.7.6紀錄](RELEASE_0_7_6.md)。最終版另核對原版main50620的Kd檔案串流及Xd MIME函式：文字、JavaScript、JSON與SVG回應明確指定UTF-8。桌面協定、離線serve與R2同樣補齊，fixture刻意不放meta charset，驗證中文顯示。

原版iframe規則保留；獨立網頁包的閱讀器CSP仍由入口index.html的meta生效，避免將閱讀器的script限制錯套到使用者HTML。HTML內嵌及模組腳本、圖片、CSS、字型與瀏覽器儲存均有實測。原始HTML內的互動狀態依該網頁自己的儲存邏輯運作，不把表單狀態寫成共享筆記版本。

相關Node回歸22項中21通過，未啟用既有512MiB上傳壓力案例1項；後續HTML匯出／範圍／完整性11項通過，UTF-8與協定案例另通過。真實Electron與Chrome驗證、兩份隔離工作區的附件快照還原均通過；未操作另一台實機。

公開cheerio依賴閉包納入可攜包；封裝檢查僅精確放行htmlparser2／parse5公開Tokenizer與token程式檔，其餘私密檔拒絕仍保留。封裝版另外實測由自身匯出分享包，避免只在開發目錄可用。

最終線上、簽章與OneDrive交付收據完成後記錄於此。
