# 原版清單與縮放整合 — 2026-10-31

本次依使用者較晚確認，**選FlexNote的完整邏輯功能，不把Gemini自製DOM／localStorage類別直接搬回來**。沿用Gemini分支89e721f提供的清單／原模組線索，實際接入已恢復的原元件；不是整包merge該分支。

## 本次接入

| 元件 | 原模組／入口 | 原factory SHA-256 | 接入方式 |
|---|---|---|---|
| 白板清單 | 74582.ListView | 8a136032797a1f1ffe566ea54295f06d8aeb5033d798b29a96696d6f36b0516c | 整個原元件、原Redux、翻譯、圖示與依賴。compact、hideOperation、按name排序使用原props。 |
| 縮放、預設比例與檢視全圖 | 46979.OO | cba922d999fccbb9b3df078b7b7e368262a6785adc15da51b67c2e2d978682f8 | 整個原元件，直接使用原23.wf控制現有原Canvas。 |
| 上方分頁條 | 23733內部eR | 1c5ca2a3e6b56728b7634895b87bd27f2e08eeeeedf722c7207ea6e680634743 | 僅增加InkBridgeHistoryTabs匯出；完整沿用原分頁、切換、關閉、排序邏輯與90561原Redux reducer。 |
| 右側卡片列表／搜尋 | 41內部nk | 9d3c61e54ba643d39f879b80bd489702e659d917f0d946392b0a6f91470a408f | 僅增加InkBridgeFlowOutline匯出；使用原32367.w父Card及原23的節點、選取、定位API。 |
| 新增白板對話框 | 64744內部rb | 1d8f82892a4f9f855a3debae02119c0927a5b8d566b86758607bdfde9aac42d8 | 僅增加匯出；原事件39641.GO、原表單／驗證／DataGen／refresh鏈完整執行。 |

這兩個factory的`locallyModified`均為false。沒有以新DOM類別、幾個SVG或參數模仿它們。

`original-shell.mjs`只處理必要邊界：自己的SQLite boards映射到原元件欄位／Redux action；原清單的getFolders回傳真實本機DB清單；原flow路由轉成InkBridge工作區切換。初版沒有folders／board-instances，後續已接入，詳末節。不是原版資料庫或原Electron main的替代啟動。

58850原服務gateway增加一個明確註冊的委派入口，目前接getFolders、getWhiteboard及六個historyTabs服務；未接服務保持原有行為，不回假成功。原碼patch工具、hash與.before-inkbridge備份沿用既有機制。原版元件與所有依賴留在Git忽略的本機來源目錄；Git只管理接線、patch工具、測試與來源雜湊。

分頁缺口另回查原ASAR的app/background.js（僅讀取，未執行）；SHA-256為9ed2877f59d645f75a27ecc517458b370ae1425227b61221c9c04489ff75f72f。原服務位置：createHistoryTab約239295、touchHistoryTab約240097、getHistoryTabs約240257、updateHistoryTabsOrder約240419、deleteHistoryTab約240856（UTF-16字元offset，原始壓縮JS）。表欄位與Gemini資料字典historyTabs條目交叉比對。

`src/main/history-tabs.cjs`是自己的Node SQLite傳輸適配，**不是聲稱直接執行原Knex handler**：保留原服務名稱／回傳形狀、sourceId+tabGroupId去重、order、30個分頁上限及最久未touch者淘汰規則。只新增原historyTabs欄位的可選表，不替換既有筆記Schema；寫入由同一個SQLite worker串行執行並交易提交。上限只關閉分頁紀錄，不刪除白板或卡片。關閉視窗也等待已送出的分頁寫入。

## 保存與切換

點原清單 → 原元件router.push → InkBridge串行導航 → editor.read/組字結束 → SQLite Commit ACK → 關閉舊overlay再flush → 更新原Canvas nodes／viewport與原清單選取。

board/content/instance資料沿用現有SQLite schema；切板不重新建一套Canvas或ShellStore。Viewport保存使用既有白板title，避免視圖操作把名稱寫回固定的「靈感白板」。正常關閉會先等正在執行的導航，再等待保存。

## 本次實測

- 修改前：既有`check-board.cjs`基線通過，原版長文下半部1011個深色像素、雙擊新增、右拖平移、卡片拖曳、組字保存及正常重開。
- 修改後：同一白板回歸通過。
- `check-shell.cjs`使用全新臨時SQLite，兩張白板各有不同文字卡片；真Electron操作原清單與原縮放元件。比例選單70%、zoom-in、fit-view、編輯中直接切板、組字期間切板等待、反覆切板、名稱保留、完整graph正常重開均通過，page errors為空。
- `check-launcher.cjs`實際BAT啟動、原Flow輸入、Ctrl+S、真DB讀回及正常關閉返回0通過。
- 後續擴充的同一check-shell流程：原分頁切換、中鍵關閉非目前頁、最後一頁關閉回原白板清單、重開分頁與正常重啟後ID保留；原右側列表的搜尋／無結果／選取均通過。
- 分頁新增的3項資料測試及直接相關9項既有database測試共12/12通過，覆蓋去重、原30頁規則、config持久化、排序交易回復與核心DB資料保留。沒有跑全部Playwright、完整效能或重新封裝。
- 截圖已檢視；本地結果為`private-original-editor/original-shell-result.json`及`original-shell-integrated.png`。沒有全套重測、沒有新效能數據或實體Windows IME結論。

## 明確未接入

- 本次後續更新已接通新增／改名／軟刪除、分組及分組間拖曳（詳末節），右鍵管理入口已啟用。清單使用原default排序，讓原DnD處理器工作。
- 原分頁內的新增入口會帶出尚未接入的多種卡片服務，目前仍明確停用並說明；使用白板清單開啟的分頁已可切換／關閉／恢復。既有新增卡片與原Flow編輯不受此限制。
- 右側元件的圖譜模式、所有特殊卡片、雙擊詳細頁與外開視窗尚未驗收；不將它們當成功能完成。外殼仍保留既有InkBridge布局，本次不是整個應用程式或Gemini分支的整體完成宣告。
- 沒有合入Gemini的私人樣本、24張縮圖、假同步／更新提示、另一套store、舊Canvas或舊編輯器入口。Gemini工作樹未修改。

## 重複執行

已準備好既有私人原始factory的工作區：執行`node scripts/original-reuse/apply-integration-patches.cjs`、`node scripts/original-reuse/collect.cjs`，再雙擊`Start-InkBridge.bat`。本輪沒有封裝EXE。

## 後續：白板管理的原邏輯接入（2026-10-31）

- 原碼證據：background.js約882104為updateBoard、882272為deleteWhiteboard、後續createWhiteboard。原刪除是isTrashed=true，保留卡片；引用查詢ft的Whiteboard分支依ID讀取，包含已移入回收站的白板。前端繼續使用原74582右鍵選單、原改名／確認對話框與64744.rb新增對話框。
- 只適配本機資料邊界：name映射既有boards.title，view保留原值；其餘原欄位保存至既有meta表board:<id>的JSON，與putBoard在同一個原有Commit交易中寫入。不重建筆記Schema、不用localStorage作權威、不回假成功。原DataGen.init使用InkBridge自己的工作區UUID與本機身分。
- createWhiteboard／updateBoard／deleteWhiteboard及findTargetsByCardIdAndType的Whiteboard、NoteCard分支，均讀寫真實本機資料。其他尚未接入的引用類型會明確拒絕。這是Node SQLite適配，沒有聲稱原Knex主程式整包移植或使用原帳號授權服務。
- 原連結格式器只將flexnote://產品scheme改為inkbridge://，保留參數邏輯；沒有變更Windows協定註冊，也未驗收系統外部開啟連結。
- 新增的check-board-management真Electron流程通過：原表單新增→原選單改名→保留view→縮放後名稱不回退→取消刪除→原確認後軟刪除→卡片／實例完整保留→查到已刪除目標→全部移入回收站後重開→禁止編輯舊白板→可再用原表單新增。已檢視失敗截圖並修正宿主圖層，沒有使用force click跳過。
- 單元及直接相關database測試10/10通過；本次沒有全套Playwright／效能／封裝重測。結果另存private-original-editor/board-management-result.json。
- 新測試曾抓到meta JOIN誤用+而無法讀回屬性，以及首頁z-index攔截原確認按鈕；已改正SQLite串接與canvas-wrap stacking context。既有check-shell管理入口預期依本次啟用功能改為原選單可見。
- 已知界線：原48677的缺失目標hydration沒有Whiteboard分支，移入回收站後分頁可能顯示建立時保存的舊標題；真實target查詢與DB仍保留新名稱。保留此原fallback並記錄，未冒稱所有分頁名稱同步。回收站復原GUI、資料夾／巢狀白板與圖示／完整背景操作仍未驗收。

## 後續：分組與白板回收站復原（2026-10-31）

本批基線為d62727b。完整重用64744.rw分組表單、74582.ListView行內改名與HTML5拖曳處理器、69193.default回收站頁面（原factory SHA-256：10f53d6e84ad31b1c7fdebef8e0b9785eef912acf5806dfc08a147d2febb4691）。64744只新增InkBridgeCreateFolder匯出，原表單／驗證／事件鏈保留；沒有合入Gemini的另一套分組類別。

- 來源核對：同一份私人background-reference.js的addFolder約877588、updateFolder878221、updateWhiteboardInstance878884、updateFoldersOrder879070、getFolders879140、getTrash951657、restoreCard958810。restoreCard的Whiteboard分支呼叫restoreWhiteboard，復原白板、其引用及原分組關係。
- SQLite適配：既有meta表保存folder:<id>與whiteboard-instance:<id>原欄位，不換筆記Schema。分組內新建、軟刪除、復原的board／WBI／folder操作同一交易提交；回傳真實Commit ACK。卡片內容及畫布實例不因回收站操作刪除。
- 首輪實測抓到19281.newWhiteboardInstance會固定containerType="whiteboard"，忽略傳入folder；已依原background的分組引用格式在邊界明確寫folder與rank，沒有修改原DataGen或另寫樹狀互動。
- 真Electron：新增分組→行內改名→組內新建白板→保存卡片→軟刪除→原回收站復原→卡片與引用完整→拖往第二分組→關閉重開完整graph一致，page errors為空。結果與已檢視截圖在private-original-editor/folders-trash-result.json及folders-trash-success.png。
- 針對性測試：catalog、database、board-management共11/11；既有check-board-management與check-shell均通過，包含組字等待、切板、歷史分頁與最後一頁返回首頁。未全套重測、未重跑效能、未封裝EXE。

仍未完成：永久刪除與清空回收站按鈕明確停用；只有白板復原已接入，其他類型沒有假資料。多個不同分組同時引用同一白板時，原第一匹配分組清理／復原規則尚待確認，本機先拒絕該刪除／復原以保留資料，此拒絕分支尚未做端到端驗收。分組刪除、Canvas巢狀白板顯示仍未接入。原DnD會分次呼叫數個服務，目前每次服務各自交易；整個跨分組拖曳的進程中斷恢復尚未驗證，不宣稱具備快照級原子性。原history標題fallback等前節限制仍保留。
