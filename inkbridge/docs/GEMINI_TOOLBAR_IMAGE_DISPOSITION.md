# Gemini 卡片工具列與貼圖交付覆核 — 2026-11-01

基線5123555；接入 Gemini574984e／ca9deb3為 f25b8ad／d81448c。原交付有可用的完整原元件與部分資料服務，但「全功能／零遺漏」不成立。下列實測取代原交付報告的完成宣稱。

## 已確認與修正

| 原宣稱／問題 | 覆核與處置 |
|---|---|
|工具列／16項選單全完成|原測只檢查部分圖示及文字；不代表每項功能接通。保留19395／85886／95077等完整原模組，再逐項接實際操作。|
|40色調色盤|原88396.Jk／61999.K7實際36色。舊測色票selector無匹配也會印成功，重啟只assert ID。新測真點色票、assert值、SQLite及重啟。|
|移除／屬性保存|onDeleteNode原契約為(objectId,instanceId)，先前錯把第一參數當instance ID；updateNodeData傳入形狀也錯。已修，幾何與attrs同交易、ACK後更新cache。|
|所有操作都可點|原浮層會因Canvas根容器自動scrollLeft=280關閉，並非單純OS失焦。使用overflow:clip移除HTML捲動，保留原引擎平移、裁切及浮層關閉規則；真實點擊測試通過，未使用force click。|
|已驗真實貼圖|舊測直接呼叫服務、手工建立MediaCard與ImageNode。新check-real-image-paste改用OS剪貼簿＋Ctrl+V，經原rG與Lexical事件處理器。|
|不可變CAS|舊碼UUID命名、writeFileSync可覆蓋、無完整性hash；尺寸還會填400×300。改為SHA-256內容尋址、實際解碼尺寸、fsync＋不可覆蓋發布、重複檔案共用、讀取驗hash。|
|revision廣播解決競爭|外部IPC直接提交再Math.max調高renderer revision無法排除重疊寫入。改成IPC只準備檔案，metadata與所有卡片寫入均走同一Coordinator。|
|圖片顯示／重啟|MediaCard cache遺失fileId，own instance未映射objectId/whiteboardId。改回19281完整converter並恢復metadata；保留hash與hash.ext兩種原URL、CORS，驗證原CanvasKit SkImage cache真載入。|
|Modal資訊錯誤|getCardLinks.whiteboardLinks原意是連線分組，不是白板membership。原背景ht查connections後產生sourceList/targetList/groupList。此工作區尚無連線模型，正確回傳零連線；membership仍由getWhiteboardsByCardId提供，不偽造邊。|
|歷史版本|原固定[]。已接contentVersionSnapshot／真版本查詢／同交易還原前後快照，還原時同步已開啟editor，避免beforeFlush把舊內容蓋回去。沒有自動清理版本。|
|在新視窗開啟|原碼假冒同一modal；已移除假success。真正獨立視窗仍未完成，不列通過。|
|Paste Hook已完成|原export存在，但未驗證事件鏈。現在要求export確實存在、不吞初始化錯誤，追蹤完整native async paste；Ctrl+S／正常關閉會等待操作及最後COMMIT。|

## 新增的完整原頁面／父元件

- 新分頁沿用58439完整note-detail頁面，factory SHA-256 `c0c571cae13be94ddebd283682a66c630937469b8c5995101b2781b788fc2db0`。僅增加editorReady回呼穿透，保留原閱讀／編輯／版面邏輯。
- 查看資訊沿用34060.GZ；浮窗沿用64744.nC與原pinnedGlobalModalCard列表。
- NoteCard節點回到19281.convertNoteCardToNode，保留原parent、dragHandle、pin與自動高度規則。
- 反向引用、頁面與資料模型的未完成部分仍有明確限制；沒有用新頁面冒充獨立Windows視窗。

## 本機實測邊界

使用獨立temp profile／真SQLite／原元件，正式FlexNote安裝、資料庫、設定與OneDrive均未變更。GUI測試串行，避免搶焦點；測試保留並還原剪貼簿。

- check-card-toolbar-menu：36色點擊／SQLite／重啟、高亮頭部、自動高度、折疊、固定、複製連結、原copy鏈＋Ctrl+V、移除實例保留內容、刪除內容進回收站，全部通過。
- check-real-image-paste：真白板Ctrl+V、真Lexical Ctrl+V、實際尺寸、CanvasKit圖像cache、SHA-256 CAS、重複共用、SQLite及重啟，通過。新版亦檢查JS／React ErrorBoundary錯誤，不只看節點存在。
- check-native-note-page：完整原頁面新分頁編輯／ACK、返回白板、原資訊視窗、歷史還原、原浮窗編輯／ACK，通過。
- 原check-shell與check-library直接相關回歸通過。
- 資料層相關測試21/21（database／catalog／persistence／query／CAS／history）。其中history unit是儲存協調器測試，GUI另有上述原生視窗驗證。
- 沒有跑完整套件、效能或EXE封裝。中文輸入測試不是實體IME驗收；Ctrl+V使用實際OS剪貼簿與Electron鍵盤事件，不是人工硬體鍵盤認證。

### 測試視窗關閉問題

一次失敗測試在app.close遇到保存保護，殘留Node→cmd.exe→Electron程序鏈。只清理直接子程序曾漏掉Electron；已核對並結束獨立測試，未強制關閉正式使用者資料。新失敗流程先還原剪貼簿再app.exit，正常產品仍保留保存失敗阻擋關閉，不能以強制退出冒充保存成功。

## 仍未完成

原選單UI存在，但以下不可列為已實作：在側邊欄開啟的完整41.n父流程、真正獨立編輯視窗、管理標籤的完整資料／collection依賴、收藏資料、Markdown／Word／PDF匯出、轉Mindmap的資料模型及排版。圖片的SVG／HEIC等未驗格式、MediaCard在卡片庫的全面支援也未列完成。原模組來源可繼續追，不應自行換簡化假UI。

完整任務仍在進行；此批是可回復、已驗證的整合基礎。啟動仍使用Start-InkBridge.bat；私人factory／registry／圖片與profile不提交Git。
