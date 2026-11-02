# 白板分頁「新窗口打開」修正

2026-11-02；基線 `c4ac84d`。使用者截圖是白板分頁的右鍵選單，不是卡片選單。前批卡片視窗測試不足以驗收這個入口；沒有把問題歸因於使用者未重新啟動。

## 原版來源與實際根因

- 原renderer23733的歷史分頁 `er(tab)` 先解析route，再呼叫 `openStandaloneWindow({key: type+':'+sourceId,route,title})`。卡片選單則呼叫另一個 `openNoteCardWindow`。
- InkBridge `__inkbridgeServices.has` 原先沒有前一服務；原58850回落至隔離preload的空IPC，因此沒有新視窗，也沒有錯誤訊息。隔離Electron中真實右鍵分頁→點「新窗口打開」：預期2個視窗，實際1個，`hasService:false`，已重現。
- 原background32573的 `y7/A` 接收key/route/title，以key重用窗口；Whiteboard對應 `flow?whiteboardId=...`。它與renderer32573的lucide圖示不是同一模組命名空間。本次按背景AST精確提取factory作唯讀參考，未執行原背景程式。
- renderer23733原factory SHA：`1c5ca2a3e6b56728b7634895b87bd27f2e08eeeeedf722c7207ea6e680634743`；私人可編輯整檔SHA：`e8d25c90c94554b571243a11acc846df704d96332b22377bf0fe647cab578319`。背景32573提取factory文本SHA：`a90c0bad6c6b03fd8f55766ed1c8932d5c27f9119ba3278deb05892c1f4878f8`。原模組沒有因本次修正而重寫或提交Git。

## 修正範圍

1. 接通原分頁選單的完整服務→preload→自有視窗管理。白板以Whiteboard/ID識別及重用，真正建立BrowserWindow；文字筆記route接回前批卡片視窗。未知／外部route明確報錯，不再回空值假裝成功。
2. 白板視窗載入**同一份現有白板renderer**：原Canvas10764、Flow34883、選單、拖曳、Lexical、側欄及分頁；初始化到所選白板及其viewport。沒有重寫一套簡化白板或用截圖冒充編輯。
3. 主renderer仍是唯一workspace writer，子白板把原有SQLite operations送回主writer，附上涉及資料列的原版本。不同資料列可以接續保存；同一筆資料被另一視窗改過時拒絕覆寫並保留草稿，不只把workspace revision提高。只有原生auto-height開啟、且雙方除了height以外所有欄位相同時，容許各renderer的衍生高度量測；文字、位置、寬度、身分及手動高度不放寬。
4. 主writer在等待COMMIT前將接受的操作投影到自己的實際編輯器／scene，讓後續主視窗輸入基於新文件；保存後再核對文字文件。子視窗ACK只前進實際寫過的資料列，其餘新資料要實際載入才成為編輯基礎。
5. 乾淨白板在別的視窗提交後更新；有待存內容／組字時保留當前編輯。加入「保留草稿並重新載入」：先在自己的profile/Recovery以UUID JSON及fsync保存operations與圖文資料，再重新載入。沒有自動合併或清理草稿。
6. 沿用前批關閉ACK、失敗保留窗口、父窗口等待所有子窗口及sandbox/contextIsolation；子白板沒有直接SQLite commit權限。CAS、Schema及CanvasKit核心不變；同一InkBridge工作區有多個視窗，並非各開一份會互相覆寫的資料庫。

主要檔案：`board.mjs`、`original-shell.mjs`、`host.cjs`、`preload.cjs`、`standalone-windows.cjs`、`workspace-window-sync.mjs`。新同步檔是既有自有Schema的適配邊界，不是另一套資料層。特別依真實SQLite契約區分instance幾何與catalog attributes、putBoard的attributes寫入，以及beginId/endId連線級聯。

## 實測

- `check-board-windows.cjs`：直接操作與截圖相同的白板分頁右鍵選單；驗證原生Windows handle、指定白板、重複開啟重用、真實Lexical輸入、原Canvas拖曳、新增卡片、父視窗改看其他白板而子視窗保持原板、立即關閉、SQLite及重啟。
- 同一專項故障注入：拒絕子視窗寫入後草稿仍在；主視窗更新同一卡片，子視窗舊草稿不覆寫；按恢復鈕後檢查實際Recovery JSON含原草稿，再確認畫面載入主視窗新內容。
- `check-standalone-windows.cjs`：前批卡片窗口的真實文字／貼圖、立即關閉、衝突、父子關閉與重啟回歸通過。
- `check-shell.cjs`：18項原分頁／白板導航／編輯／組字等待／重啟流程通過，無renderer error。
- `workspace-window-sync.test.mjs` 8項＋note-version/persistence 9項，共17項通過。包括不同資料列、同筆衝突、只前進已寫資料列、群組相對座標、真實board attributes與連線級聯；沒有以單元測試替代GUI驗收。
- 測試曾立即讀取DB而沒有等待Ctrl+S的非同步ACK，造成新增卡片數量檢查過早；已改為等待同一真實flush Promise。未調整預期數量或用固定sleep掩蓋競爭。
- 另實測子白板有待存文字時直接關主視窗，等待所有子視窗保存後再退出；重啟確認 `PARENT_CLOSE_FLUSHES_BOARD` 實際在DB。補測曾有一次30秒關閉逾時；之後移除關閉前的診斷計時干擾並捕捉對話框，立即關閉流程後續通過。已以失敗→修正→通過的專項單元案例處理自動高度誤衝突，但沒有宣稱它已確證為那一次逾時的唯一根因。長時間競爭壓力仍未全面驗收；逾時必須保留視窗，不冒充保存成功。

私人截圖 `private-original-editor/board-window.png` 已視覺檢查，測試只使用 `%TEMP%/inkbridge-original-modules-board-window-*`。沒有測正式FlexNote或日常InkBridge profile，沒有重跑完整套件。

## 界線與使用方式

本次驗收白板分頁及既有文字卡片視窗；其他未接入的分頁種類明確報錯。新白板視窗的所有媒體／標註／大型工作區壓力測試未全面驗收；前批Ctrl+B及實體IME限制未在本次宣稱解決。主視窗依然管理整個工作區生命週期。

使用者後續提供FlexNote獨立視窗截圖並確認主／額外視窗可區分層級，亦明確表示不介意雙開，外觀不是這輪可靠雙開的阻擋條件。原64744的 `oa` 完整獨立分頁／前後導覽外殼已定位；本批保留現有完整白板外殼，未宣稱已套用那個較精簡外殼，不為外觀擴大修改。主視窗是工作區生命週期及writer管理者，額外窗口透過它提交；不是第二份獨立資料庫。

正常關閉InkBridge後，仍用 `inkbridge/Start-InkBridge.bat` 啟動，白板分頁右鍵→「新窗口打開」。不需重建私人原模組；本次改的是自有接線及保存邊界。回復以Git revert本次提交，不刪除工作資料或Recovery檔案。
