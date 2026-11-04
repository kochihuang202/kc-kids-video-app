# 畫筆、思維導圖及空白處右鍵（0.5.6）

## 來源與規格

沿用已固定版本的1.1.65私有可讀模組，不重新逆向整套程式。原版48626.nZ為側邊創建工具列；10764實作畫筆手勢、平滑、橡皮擦與編輯覆層；64744.ov已供應49871.B筆跡工具列。原先NativeTools白名單封鎖無aria的drawing-trigger與mindmap按鈕，Canvas又固定initialDrawingStrokes=[]，所以功能無法使用／恢復。現在放行既有入口，依白板ID讀取實際筆跡。

思維導圖沿用19281 factories、81958.Oy/jm/X與完整Canvas編輯器；apply-mindmap-patches.cjs核對原factory SHA256 4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de，以TypeScript AST抽取48626父層tJ/tG/tZ完整callback，注入明確Redux、圖資料、主題與Canvas bindings，不把原碼本體提交Git，不另寫布局／鍵盤演算法。工具可重複執行，私有來源修改前後SHA記在integration-patches.json。

原碼校正PRD：未編輯時Enter進入編輯，Tab加子節點；編輯時Tab加子節點、Enter加同級，皆由相同onMindmapAddChild協定處理。根節點分別使用isLeftCollapsed/isRightCollapsed；一般子節點才是isCollapsed。雙向布局枚舉為dual-side，不把舊mindmap值當作已驗證雙向。

90214.av為完整右鍵父hook，31167.TS為原版創建選單；接回Canvas onContextMenu，保留原本4px拖移判定與Canvas右鍵平移抑制。沒有額外加另一套contextmenu監聽器。本版空白選單開放筆記卡片、思維導圖、分組，已有複製內容時保留原版貼上入口。未接的其他創建／匯入項目透過能力列表隱藏，避免空操作；不將PRD列出的所有選單項當成原版已存在或本次已完成。

## 儲存邊界

不改既有Schema版本，使用現有meta catalog新增drawing-stroke、mindmap、mindmap-node、mindmap-instance四類；load提供drawingStrokes/mindmaps/mindmapNodes/mindmapInstances。工作區快照仍保存整份SQLite。共享視窗的precondition/projection也認識新類型，保持遲到寫入與同筆資料衝突檢查。

畫筆保存完整pathData/polyline、工具、顏色、粗細與變換；原版負責取樣／命中／渲染，適配層只接讀、新增、部分更新與刪除。思維導圖map、flat nodes、placements分離，局部更新merge舊節點，驗證拓撲循環，重開用原版布局重建。由白板移除根實例保留可重用導圖內容，不以刪節點方式抹去其他引用。

新導圖文字編輯註冊實際Lexical更新，組字中暫不讀取；flush沿用compositionend及Commit ACK。測試曾抓到DB已是新字但Canvas仍是Mindmap，已補齊live editor → shared graph → Canvas資料鏈。建立子節點等原版服務先進入同一navigation/coordinator隊列，Ctrl+S／關閉會等待實際寫入。

## 已執行驗收

- check-drawing-mindmap-menu：真實滑鼠畫筆與螢光筆、變色、橡皮擦；空白右鍵與真實新增筆記；選單及側欄工具列建立導圖；根輸入、Tab子節點、編輯中Enter同級；Canvas新字與SQLite一致；真實根拖曳、根折疊展開；移除放置保留內容；白板隔離、切板樹邊、正常重開。
- 最新隔離場景：TEMP/inkbridge-original-modules-draw-mindmap-vqF3Fs及JxSuZp。已目視檢查畫筆、選單、導圖圖片。鍵盤測試依editingNodeId等真正自動聚焦就緒，未以固定延遲假裝保存。
- 修改前／後check-native-multiselect-context皆通過：原卡片右鍵、批次操作、右鍵拖曳平移與重開。
- database.test及workspace-window-sync.test共17項通過；drawing-mindmap.test另2項實際SQLite／projection測試通過，涵蓋新目錄no-op、rollback、重開及保留導圖內容。
- 一般連線刷新保留mindmap-conn樹邊，相關check-native-connections另測。

沒有測試宣稱：完整XMind／Markdown導圖匯入、獨立導圖頁、多媒體／卡片拖入導圖、分支跨樹合併拆解、全域Undo／Redo、實體手寫筆壓感，以及與原版效能相同。這些不以新入口可見當作完成；本次沒有啟動或修改正式FlexNote、正式筆記與設定，沒有跑無關全套回歸。
