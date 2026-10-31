# 原版編輯／渲染模組移植：實際進度

2026-10-31，Asia/Taipei。此輪停止擴寫0.4自製編輯／文字排版底座。沿用既有REA定位，直接重用原模組。

## 啟動

雙擊專案根目錄 `Start-InkBridge.bat`。它直接啟動原始碼版，不執行舊0.4的main，也不依賴任何新EXE。

- 原碼：`private-original-editor/source-modules/`，3737個可讀完整webpack factory；編輯器73866、NoteCardDrawer74137、TextDrawer71560、原Lexical41570、字型65857。
- 原資源與未格式化來源：`private-original-editor/vendor/`，含同版本字型、CanvasKit WASM、Next前端與資源。
- 可重複組裝：`node scripts/original-reuse/collect.cjs`，會採用source-modules中的本地修改，不覆寫它們；source-baseline/modules manifest區分原始hash、目前hash與本地修改。
- 本機試用資料：`private-original-editor/profiles/desktop/Workspace/inkbridge.sqlite3`；Profile/Session/Logs獨立。不是正式FlexNote，也不是舊0.4工作區。
- 前端宿主、有限IPC與保存接合：`scripts/original-reuse/`；SQLite worker/schema與PersistenceCoordinator沿用既有InkBridge程式。

## 實際重用

直接載入完整原73866 Editor及其Settings/Flash/History/Table/Toolbar providers、63268 store、16125 Redux Provider、1643翻譯、51648/43867/29242 Router/PageLoader/Context。原_app模組須先初始化，否則會出現循環依賴R8讀取失敗；沒有改成假store或假Router來跳過。

原74137 NoteCardDrawer、71560 TextDrawer、37757 CanvasKit初始化、65857原字型provider都已實際執行。原版drawer接收原AST並繪製，不經0.4自製projection/NoteLayout。原版有效scale低於0.1才走該路徑skeleton；不存在舊自製medium的3行上限。整體白板還有宿主LOD決策，未宣稱全部已移植。

原版onChange/onSave callback沒有一路await到SQL的ACK。保存接合使用原public `editor.read(fn)`（預設force-commit），41570.GvG取得原root文字；組字結束才讀取，接回既有Coordinator與真SQLite COMMIT ACK。沒有固定延遲或假成功服務。

## 已執行的針對性驗證

- 中文真實輸入與原onChange輸出。
- OS剪貼簿Ctrl+V：heading、bold、list、code/highlight、link、table、callout與collapsible；原AST出現17類節點。測後恢復剪貼簿。
- 原版字型／CanvasKit／NoteCardDrawer長文繪製；已實際檢視畫面。
- 輸入後立即Ctrl+S，SQLite含最新字，返回真ACK。
- Chromium CDP組字期間save等待，選字完成後才ACK。不是實體Windows注音輸入法驗收。
- 正常關閉／重開，完整contents與instances深度比對一致。
- 實際執行Start-InkBridge.bat，原編輯區可見、輸入保存可讀回、正常關閉返回0；只跑啟動與保存這條相關流程，未全套重測。

細節輸出放在private-original-editor/runtime-result.json；包含自產測試AST，不推送原碼或私人資料。

## 隔離與來源界線

原ASAR SHA-256：d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1。僅讀取核對並複製，沒有修改安裝或執行其Electron main。

宿主使用自己的Electron、sandbox/contextIsolation、僅限InkBridge SQLite的preload，沒有原window.ipc；外網、權限要求、外部導覽被限制。原資源由僅允許指定靜態檔的localhost宿主提供，profile/SQLite不作靜態檔供應。

原版sources/resources/compiled factories、研究摘錄、profile與成品均Git忽略；通用公開封裝流程另排除private*。Git只提交自行撰寫的啟動／組裝工具、接合、測試及不含原碼的結果。

同一包內有98個不同的重複module factory變體，工具保留所有原資源並記錄選擇順序（_app/framework/main/editor優先）；不把不同hash直接宣稱等價。已實測載入2122模組無失敗，不代表其他路徑已全驗收。靜態依賴分析仍有6個未解析的候選邊，可能含本地函數呼叫；沒有假造模組補齊，runtime未走到的部分保持未知。

這是可讀、可改、可重組裝的恢復程式碼，不是已拿到原作者的完整TypeScript專案、型別或source maps。未更換原碼為自製等效版本。

## 未完成，不能當成全功能產品

- 目前是獨立原模組移植預覽宿主；尚未接回既有無限白板／完成原版整體CanvasEngine移植。
- 全部41註冊節點／26 custom的所有操作、所有快捷鍵、公式/圖表、附件、跨卡引用及原服務仍需接通與逐項驗收。
- 未以假回覆掩蓋缺失服務；原版主程式資料服務不會因前端模組能掛載就自動可用。
- DOM使用原importModal宿主、Canvas使用原NoteCardDrawer；尚未證明NoteCard overlay完整幾何、固定高度、焦點／拖放與整體效能同原版。
- 長時間穩態記憶體、實體IME、完整原版效能比較尚未驗收。

Gemini側邊欄在獨立.worktrees/shell-navigation、feat/shell-navigation；本輪不合併、不修改其工作樹。合併時再檢查共同容器、全域CSS及焦點／快捷鍵。
