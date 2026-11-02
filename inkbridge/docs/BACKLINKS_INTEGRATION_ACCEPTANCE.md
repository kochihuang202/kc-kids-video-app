# 雙鏈完整操作整合與驗收

2026-11-02。程式基線32b68ee，沿用既有原版私有模組與SQLite，未修改正式FlexNote或使用者資料。

## 本批完成的實際流程

- `[[` 原版搜尋／插入卡片引用，儲存及重啟保留。
- 同白板引用定位畫布中的目標；不在目前白板的卡片使用原版彈層。
- 目標的原版雙鏈列打開來源，來源引用再返回目標。
- 白板歸屬籤切換到另一個白板並定位同內容的正確實例；先等待既有保存及路由完成，再消費focus request，避免先在舊板清掉請求。
- 刪除引用後反向計數歸零、重新建立後恢復；來源改名後面板顯示新名稱。
- 區塊引用使用Lexical NodeState的`$.blockId`，點擊帶blockId進原版卡片彈層。
- 圖片、PDF、白板、群組及原始附件的資料契約。圖片/PDF/白板/原檔案已有真實選單操作測試；群組歸屬與查詢有單元檢查。
- 圖片caption內的mention/embed-card也會被反向掃描；同內容多個白板實例不會變成多筆來源。
- 變更COMMIT成功後通知已掛載的原版雙鏈面板重新讀取。無輪詢或固定延遲保存。

## 原版證據與判斷修正

先前把FlowContext.clickMention空函式列為主要缺口，判斷不夠精確：原版48626同樣留空。真正點擊鏈是64744.nq的document pointerup；6827的額外onClick只處理standalone模式。此次核對後沒有發明另一套重複點擊監聽。

|來源|保留的完整行為|接入修正|
|---|---|---|
|64744.nq|懸停、同板fitView、區塊彈層、白板/群組路由、附件動作|以InkBridge router.pathname代替隔離主機實體'/'；提供window.router|
|6827|Lexical mention序列化、顯示、右鍵引用選項|保留原實作|
|34060.tg|雙鏈列表、來源彈層、白板歸屬與群組入口|ACK事件觸發原讀取effect|
|48626/23407|fitviewObjectParam與原生選取/fitView|自有宿主等待白板相符後消費請求，不另外寫相機算法|
|89174/96142/34489|原版搜尋Listbox與Lexical插入|補Whiteboard/File型別及NodeState blockId資料契約|
|背景2205.h及getCardLinks|遞迴children與caption.editorState.root掃描、保留mention/embed-card|自有SQLite投影加入同樣遍歷與section歸屬|

原檔案引用僅接受已登記CAS ID。主進程先驗證SHA-256與真實路徑仍在獨立附件目錄，再交給Electron shell.openPath。沒有增加任意路徑、正式資料庫或OS協定註冊權限。

## 實測與界線

|命令（inkbridge目錄）|結果／證據|
|---|---|
|node scripts/original-reuse/check-native-backlinks.cjs|真實來源輸入、正反向點擊、解除/重建、改名、跨白板選取及實際置中、重啟保留|
|node scripts/original-reuse/check-native-block-links.cjs|真實區塊搜尋與插入、懸停、blockId彈層內容、重啟保留|
|node scripts/original-reuse/check-native-reference-types.cjs|圖片解碼、原版PDF Canvas、白板導航、原檔案IPC及有效路徑、各類引用AST重啟與附件原始雜湊|
|node --test tests/original-backlinks.test.cjs|4項資料契約/完整性測試通過|
|node scripts/original-reuse/check-native-groups.cjs|真實群組內編輯與Ctrl+S、位置不偏移、拖曳/取消群組與兩次重啟|
|node scripts/original-reuse/check-native-connections.cjs|原連線方向、工具列、刪除級聯與重啟回歸通過|

所有桌面測試使用獨立TEMP profile。附件測試攔截shell.openPath，確認真實CAS路徑及檔案位元組，沒有真的啟動外部Windows檢視器；不宣稱OS檢視器內部渲染已驗。面板已掛ACK事件刷新，GUI驗證的是來源實際修改後重新打開面板的正確資料；未宣稱獨立Windows多進程同步驗收。

心智圖、日記、網站與各種高亮的資料本體目前尚未建成，這些來源類型仍未驗收；沒有把空陣列當成功能完成。PDF匯出繼續暫緩。沒有跑全量套件或效能測試。

## 同批發現並修復的保存回歸

上次群組修改把persistGeometry從拖曳流程移除，卻遺漏編輯內容更新仍會呼叫。真實輸入測試抓到ReferenceError。本次恢復該尺寸保存函式，加入父群組相對座標轉換，且新增群組內真實輸入/SQLite ACK/位置驗證，不能再只憑群組建立與拖曳通過。

## 使用與重建

正常關閉舊版本，執行Start-InkBridge.bat。修改位置均在自有宿主、資料適配及可重複的apply-integration-patches.cjs；私有原廠factory、register-original.js與測試資料不提交Git。

若需在現有私有資源上重新套用：先執行node scripts/original-reuse/apply-integration-patches.cjs，成功後執行node scripts/original-reuse/collect.cjs；再啟動BAT。原資料格式及歷史保留，原檔案以CAS共用。
