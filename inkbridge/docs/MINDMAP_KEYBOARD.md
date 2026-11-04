# 心智圖方向鍵與刪除接續選取

## 確認的來源與規則

本機 XMind 23.07.180256 以唯讀方式檢查 renderer/editor.js 與 renderer/2907.js。後者 SHA-256：e446d27be21dcec248156fe8faae4c1bc6844fd083b1d9af5260668114f97542。沒有啟動正式 XMind、讀寫其使用者文件，也沒有將專有實作納入 Git。

- editor.js 將一般刪除映射到 mutate:delete；deleteSingleTopic 是另一個保留子節點的命令，本輪沒有加入後者。
- 2907.js df/ka/Ya：依布局的親子／同級導航規則先找候選，找不到才用方向、軸向對齊及距離做幾何備援；只考慮可見且在範圍內的節點。
- 2907.js bR/OR：刪除後優先前一個尚存同級、再下一個、最後遞迴回父節點；多選結果去重。text edit session 不走節點刪除命令。
- InkBridge 既有 FlexNote10764 的方向鍵會在樹規則失敗後使用全畫布候選；Delete會先清空選取再通知父層。原有 SQLite 適配未接續選取，實際基線測試刪除b子樹後選取為[]。

## 實作

src/core/mindmap-keyboard.mjs 是依以上確認契約自行撰寫的導航與刪除接續計算。10764 原生鍵盤入口、編輯器保護、選取及視野揭露仍沿用，僅以 AST 精確替換原心智圖候選函式呼叫。一般卡片、音訊方向鍵不變；同圖可見候選用完時保留目前選取，不跳到其他導圖／卡片。根的左右方向分別進入該側第一個可見分支，左右分支向內回父層、向外進子層，上下優先同級。

原生全域鍵盤入口另略過isComposing與keyCode229；已有contenteditable／input及editingNodeId保護保留。這是事件層保護，不是實體IME驗收。

original-mindmaps 在原子刪除提交前依舊樹計算接續節點，SQLite ACK及重新hydrate後才套用選取。切板或使用者已選取其他尚存節點時不搶走新選取。根的Delete沿用既有移除白板放置、保留可重用導圖內容的行為；未改成刪除所有引用。

沒有新增Schema或將觀看選取寫入共享資料。檔案掛點與前後雜湊由integration-patches.json記錄，可重建、回退。

## 已執行測試

- check-mindmap-keyboard：獨立SQLite，滑鼠實際選取及真實方向鍵，右向／左向／雙向導航；刪除b及其子樹後選a、刪a後選c、刪c後選root；直接Tab接續新增；文字編輯內方向鍵及Delete、組字事件不刪節點；正常重啟後資料與導航仍正確。起始白板明確選定，不依多白板預設排序。
- 原有基線在「delete subtree selects previous」失敗：預期a，實際[]。修改後通過。
- mindmap-keyboard單元3項：結構導航、隱藏／跨圖／一般卡片排除、前一／下一／父節點／批次刪除選取。
- drawing-mindmap及appearance契約共3項通過。相關實際check-drawing-mindmap-menu與check-mindmap-appearance通過，沒有重跑無關全套。
- 尚未驗證：實體中文IME、XMind runtime逐鍵對照、全域Undo／Redo、長時間效能。本輪未修改正式FlexNote／正式筆記。
