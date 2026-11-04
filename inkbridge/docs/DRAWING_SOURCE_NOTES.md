# 畫筆來源與資料接線

2026-11-04，既有1.1.65可讀私有模組的針對性核對；沒有重新執行完整REA，未啟動原版或改動正式資料。

- Canvas10764：從Redux flow.drawingTool/color/strokeWidth取得工具。pen/highlighter/smart_shape在mouseup產生完整polyline points，createDrawingStroke；橡皮擦沿路命中刪除整筆，deleteDrawingStroke。原版34696保留中點二次貝茲平滑，不由InkBridge替換。
- Canvas10764：getDrawingStrokesByWhiteboardId(whiteboardId)預期{success:true,strokes:[...]}; 若initialDrawingStrokes傳入[]，會直接使用空陣列並跳過讀取服務。正式掛載應移除此空prop，或傳真實資料。
- 原版完整工具列48626.nZ：class drawing-trigger主按鈕、drawing-popover-content浮層，包含pen/highlighter/eraser、原版寬度slider與五色。主按鈕及三種工具按鈕沒有aria-label，不可只用aria白名單把它們全停用。原版Redux23407.sq/vU/OV負責工具/顏色/寬度；實際寬度狀態限制2–24，PRD聲稱三段寬度不足以代表實際原碼。
- Provider64744.ov 已供應 DrawingStrokeToolbar:91724.BS，即完整49871.B；不需另造工具列。選中筆跡的顏色、寬度、刪除及strokeGroupId分組都呼叫下列原版服務。
-10764、14153、48626、49871四份來源的實際stroke服務只有getDrawingStrokesByWhiteboardId、createDrawingStroke、updateDrawingStroke、deleteDrawingStroke。移動、縮放、父群組變更透過updateDrawingStroke({id,updates})，更新translateX/Y、scaleX/Y、parentId或樣式。

InkBridge-owned original-drawings.mjs使用現有coordinator與catalogOperation('drawing-stroke',row)。需要database meta白名單新增drawing-stroke、deleteCatalog可刪drawing-stroke，load公開drawingStrokes陣列；不新增專有程式碼、原版二進位或資料。

createOriginalDrawings({navigate,coordinator,load,store,catalogOperation,getBoardId})公開has/call/hydrate/settle/visible。服務讀取不flush避免原版mount讀取與編輯器flush遞迴；寫入由既有navigate序列、await SQLite ACK。完成寫入不整體覆蓋原版stroke陣列，以免丟掉使用者正在畫的第二筆。呼叫端保存／切板時應在coordinator.beforeFlush之外等待drawings.settle；切板flush成功後可hydrate(graph)。不得在coordinator.beforeFlush內等待settle，因write本身需要coordinator.flush。

此模組尚未由子代理啟動GUI測試；真實畫筆、橡皮擦、變更色寬、拖移、切板、Ctrl+S、重啟由主代理整合驗證。PRD的感壓／效能字句不視為此靜態核對的實測證據。
