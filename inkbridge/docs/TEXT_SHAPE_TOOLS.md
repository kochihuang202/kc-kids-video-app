# 文字／形狀工具與側欄互斥選取

依使用者截圖，接通右側T與形狀圖示；進入Perth時上方「白板」不再同時顯示選取灰底。返回總覽時也清除route.query中的舊whiteboardId，避免下方Perth殘留灰底。

## 原版來源及實作邊界

- FlexNote1.1.65：48626完整text/shape建立按鈕、子選單、拖放預覽／finalize；19281.newTextNode、textNodeToTextElement、textElementToTextNode；99665→94700批次移動／刪除；34883→73866原Lexical編輯器；原CanvasKit Text Drawer及原文字／形狀樣式工具列。沒有用自製DOM形狀替代。
- 所有文字、形狀共用text-element catalog，row.isShape／shapeType區分形狀；保留原生content富文本、x/y/width/height、parentId、scale、color、textColor、strokeColor／Width／Style、fillOpacity、rotationAngle及原生自動寬高欄位。
- 自寫original-text-elements.mjs僅適配SQLite／Commit ACK／場景投影；原版控制手勢、形狀幾何、文字排版、命中與選取。create/update/batch/delete映射既有meta catalog；載入textElements，shared-window precondition/projection納入新類型。不變更Schema版本，不遷移正式資料。
- 活躍Lexical的更新註冊及beforeFlush沿用現有組字與最新文件讀取流程，直接stage最新文字；服務寫入沿同一navigate/coordinator隊列。切板／外部工作區載入時更新自己的textElements map，hydrate投影納入原有sections.extraNodes。
- 原工具列按鈕與選項以AST掛上穩定識別供既有gate啟用；保留原父元件、選單與預覽，不只是開一個可見按鈕。UI樣式與幾何沒有自行仿寫。

## 驗證範圍

- check-text-shape-tools真實Electron：總覽與具體白板雙向互斥、原T工具新增與輸入中文、原形狀工具新增及移動、雙擊形狀輸入文字、保存／正常重開、刪除形狀保留文字。樣式的color／strokeColor／strokeWidth有服務邊界提交及重開驗證；沒有宣稱逐一點過全部形狀與格式選項。
- text-elements單元2項：SQLite實際寫入、no-op、錯誤回滾、重開、刪除；多視窗前置版本／projection與衝突拒絕。
- 本輪改動共用側欄、sections.extraNodes與48626工具列，因此僅回歸check-nested-sidebar-reveal及check-drawing-mindmap-menu，皆通過。不是全量回歸。最後的導航query修正只重跑本功能測試。
- 隔離資料與實測畫面在TEMP/inkbridge-original-modules-text-shape-*。原版FlexNote、正式資料及設定不變。未宣稱物理IME、全域Undo、全文字／形狀雙鏈或連線相容性、長時間性能、兩台實機同步全部驗收。
