# Gemini shell 分支審查（2026-10-31）

審查版本：`feat/shell-navigation` / `89e721f`。對照本分支 `7c35e62`。本次不合併、不修改兩邊產品程式；只建置與執行隔離測試。Gemini工作樹保持乾淨。未重新執行完整REA。

## 決策

**不整包合併，也不另寫一套自製側欄。保留Gemini的視覺、功能盤點與可用局部成果；核心元件優先使用已取得的原版完整模組，補必要的InkBridge資料／生命週期接線後分批整合。**

相對共同祖先，Gemini新增／修改22個InkBridge檔案，約11,581新增行。它仍以舊自製CanvasEngine與InlineNoteEditor為執行入口，沒有接入本分支已驗證的原Canvas10764／Flow34883；整包合併不會自動得到原版編輯核心。

## Porting的實際程度

- `left-sidebar.mjs`、`whiteboard-dashboard.mjs`標示原模組ID，但實際是新的DOM class、HTML模板與CustomEvent事件。
- `shell-store.mjs`標示Central Redux／IPC架構，實際是新的class＋localStorage，沒有沿用原Redux／資料服務呼叫鏈。
- 已取得的79509／74582／81633／78507則保留原webpack factories及React相依。兩者架構不同；不能把目前DOM版本稱為「完整原元件直接移植」。部分SVG／文字／樣式可能取自原版，不能據此斷言每一行都是新寫或都沒價值。
- 目前證據支持「依研究重建外觀及部分行為」，不支持註解與commit中的「100%」完成聲明。這是實作審查，不推測Gemini的主觀動機。

## 確認問題

| 優先 | 問題 | 證據與影響 |
|---|---|---|
| P0 | 改名先改UI，SQLite保存失敗 | 真Electron：側欄改成AUDIT_RENAMED，Flush回Invalid board view，DB仍為原名，pending=1。workspace.mjs307送putBoard缺少必填view；database.cjs64驗證確實拒絕。 |
| P0 | 刪除先移出UI，SQLite沒有刪除 | 真Electron：確認刪除後shell找不到該板，DB仍保留；Flush回Unknown commit operation，pending=1。workspace.mjs317送deleteBoard，但database.cjs253不支援。失敗操作會留在待保存佇列；未測長時間後續編輯恢復。 |
| P0 | 使用者資料／縮圖進入Git追蹤 | flexnote-data.json及.mjs包含使用者工作區名稱／識別與24張內嵌圖片；各約1.09MB，圖片字串共1,065,324字元。不可隨產品整包合入；需另檢查既有歷史及遠端存取範圍。本次未重寫歷史、未移除研究證據。 |
| P1 | 點側欄白板即報錯 | 真Electron點擊得到shellStore.setActiveBoardId is not a function。left-sidebar.mjs870／shell-coordinator.mjs89、165呼叫的API沒有實作。 |
| P1 | 工作區有兩份不一致的資料來源 | 全新隔離資料：SQLite只有1板，shell預設顯示36板。ShellStore使用固定資料樣本及localStorage，TopBar還有另一組無v4的tab儲存鍵；不能當成SQLite工作區或備份可完整回復。 |
| P1 | 視圖切換留下訂閱 | 真Electron連續3次白板列表→Canvas，ShellStore listeners從1增至4。Coordinator每次new Dashboard但未呼叫舊物件destroy；目前是確認的訂閱累積，未量測長時間記憶體。 |
| P1 | 同步／更新顯示假完成 | left-sidebar.mjs962／968直接alert「最新／同步完成」，沒有執行或等待對應服務。不能用作功能完成證據。 |
| 待驗 | 改名後視圖保存可能改回固定標題 | workspace.mjs16的stageView固定送title='靈感白板'。目前改名先因view缺失失敗；尚未在修正後驗證這個後續情境。 |
| 待驗 | 待辦AST與純文字可能分歧 | workspace.mjs的toggle-todo-item修改body卻沿用舊document；尚未以富文本checklist做端到端驗證，不算已確認資料損失。 |

## 本次測試與界線

- `node --test tests/shell-navigation.test.mjs`：13/13通過。使用MockElement／setupMockDom，未掛載完整ShellCoordinator、真Canvas或SQLite；不能證明端到端保存與互動正確。
- `node scripts/build.cjs`：成功。首次受沙箱目錄權限阻擋，取得本機執行權限後成功；不列為產品建置缺陷。
- 三個不同臨時profile的實際Electron檢查：navigation、rename、delete。改名／刪除各加入一筆指向真實隔離SQLite白板的shell測試樹項目，以避開36板樣本與真DB本來就不一致的干擾；未修改產品原碼或正式資料。
- navigation測試直接點擊既有側欄；訂閱檢查直接送出產品現有導航事件，未模擬DOM。
- 失敗保存測試最後明確退出測試程序；**沒有把這些失敗案例算成正常關閉／重開通過**。
- 原始結果與截圖：本機忽略目錄 `private-original-editor/shell-review-result.json`、`shell-review-start.png`。截圖含分支內建的使用者樣本，不納入Git或對外展示。
- 未全套重測、未執行正式FlexNote、未做長時間效能／所有功能比較。

## 保留、取代與整合順序

1. 保留分支歷史、REA／PRD、功能入口盤點、視覺布局、SVG來源與有價值的斷言；測試需要改接真元件與SQLite，不能只保留Mock成功。
2. 不直接採用目前ShellStore、CustomEvent業務流程、假同步提示、私人樣本資料；不把舊Canvas／編輯器入口帶回整合版。
3. 從已恢復的原側欄／分頁／樹元件確認完整依賴、store selectors和服務輸入，優先掛載原元件；只寫必要的InkBridge資料邊界。原碼、依賴和服務接線未確認前，不另造替代殼。
4. 第一個整合切片只做「真DB白板清單→開啟→原Canvas／Flow編輯→Commit ACK→切板→重開」。再加改名與安全刪除；此時才逐批挑選Gemini可用變更。
5. 不整包merge／cherry-pick目前18個shell commits。這樣能保留已驗證的原版白板核心，也避免為修補兩套狀態系統持續重工。
