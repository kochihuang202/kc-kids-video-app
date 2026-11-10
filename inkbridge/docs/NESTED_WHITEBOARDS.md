# 白板內放白板

原版來源：FlexNote1.1.65的48626建立／拖放／白板選擇器、31167右鍵新增／引用、19281白板節點轉換、74582側欄遞迴樹、99665→94700批次移動／刪除。沿用完整原版互動與CanvasKit83552白板Drawer，未用自製卡片替代。

白板內容與白板引用分離。whiteboard-instance catalog的containerType=whiteboard、containerId=父白板，whiteboardId=被引用的白板；folder類引用不變。原側欄只餵入folder引用，現在餵入所有有效子引用與對應白板資料，保留原版展開收合。新增及引用入口解鎖；工具列父元件原先裁切掉的選擇器與放置預覽一起接通，不只啟用圖示。

src/core/nested-whiteboards.mjs接既有coordinator、SQLite及CAS。驗證目標／父白板存在、自我及間接循環；批次操作先驗證所有列再stage，刪引用不刪內容。失敗回復畫布投影。shared-window原有whiteboard-instance前置條件與快照完整DB保存機制沿用，不新增Schema。

預覽沿用10764監聽50852.j（canvaskit-capture-whiteboard-preview），原版負責fit場景、CanvasKit擷取、512×384縮圖與WASM釋放。saveWhiteboardPreview邊界將PNG存進既有SHA256CAS及files catalog，白板attributes只記inkbridgePreviewFileId。節點投影將此CAS圖供原Drawer使用，不覆寫真正白板背景。離開被引用白板時更新縮圖；不是即時嵌入可編輯畫布，也不宣稱未進入過的舊白板已自動產生預覽。

check-nested-whiteboards：隔離資料、原生右鍵新增、側欄展開、改名、拖曳、雙擊進入、循環拒絕、子板內容、原生內容縮圖與CAS雜湊、重開、移除保留白板、原生既有白板選擇器及工具列入口。循環單元與SQLite／shared-window相關18項。check-board-dashboard回收站入口更新成已完成的版本選單→回收站，所有刪除／取消／復原斷言保留，不再點已隱藏的舊按鈕。

已知邊界：尚未以兩台實體電腦或長時間大量多層白板壓測。根白板的刪除仍沿既有回收站規則；跨多分組復原限制保留。沒有啟動或修改正式FlexNote、沒有讀寫正式筆記。

## 交付

0.5.9／發布序號10，程式提交1a47d50，可攜目錄release/InkBridge-0.5.9-1a47d5093de3-ba72d9。以此目錄自己的runtime/electron.exe及app跑check-nested-whiteboards並正常重開通過，隔離資料TEMP/inkbridge-original-modules-nested-oRqN88；來源版內容縮圖已目視檢查preview.png。原生工具列測試限定dialog內同名白板，避免誤點背景側欄；不是以force點擊略過遮罩。

已產生0.5.0–0.5.8共九個基底的直接增量（約6.06–6.12MB），逐包經Windows更新器Stage驗證簽章／逐檔雜湊後，依先ZIP後描述檔複製至既有OneDrive交換根目錄，複本雜湊相同。0.5.8→0.5.9 releaseId：e8784c0a-3d7d-4617-93d9-28eee4376e5f；完整私人收據release/nested-delivery.json。未代按正式程式更新，不宣稱OneDrive雲端上傳已完成。
