# 視窗拖曳與 PDF 拖入修正

2026-11-02；基線 `6bdd13a`。沿用原版模組與既有自有SQLite/CAS邊界，正式FlexNote、日常InkBridge profile及專有工廠未改動；沒有更換白板引擎或重跑全套測試。

## 視窗拖曳

REG-111舊測試的單分頁／非最大化情境仍然通過，因此不能用它否定使用者回報。新增18個分頁並捲到最後，實際重現：左側空白的Windows `WM_NCHITTEST` 從應有的HTCAPTION(2)變成HTCLIENT(1)。原版23733分頁內容在水平捲動後，有no-drag矩形從x=-2510延伸到838；DOM已由overflow裁掉，原生窗口區域仍覆蓋左側空白。這是新增的多分頁邊界，並非再次刪除REG-111的CSS修正。

保留原23733完整導覽控制與分頁。自有NativeNavigationControls適配器只在真正的空白位置建立一個原生caption命中區，依導覽組的實際矩形及ResizeObserver更新，放在捲動子樹之後；pointer-events:none，不攔DOM彈窗。它仍使用Windows原生窗口拖曳，沒有自己計算並搬動窗口的滑鼠拖移器。卸載會移除節點、observer及resize listener。多個CSS裁切／區域試驗未通過，已全部撤除，不保留無效規則或修改原工廠。

實測：

- 維持 `check-titlebar-drag.cjs` 原有四項預期：左右空白均HTCAPTION，側欄按鈕／分頁均HTCLIENT；側欄實際點擊仍有效。
- `check-titlebar-many-tabs.cjs`：18個分頁、捲動後左空白恢復HTCAPTION，導覽及分頁保持HTCLIENT；最大化版本也通過。分頁已填滿時沒有右側空白，因此這個新情境不把分頁列邊緣冒充空白；原單分頁測試仍保留右空白驗證。
- 非最大化版本用Windows `SetCursorPos/mouse_event` 真實滑鼠拖動隔離窗口，驗證窗口x實際增加，而不是僅比CSS字串。最大化版本驗證原生命中碼，未把它稱為已實測從最大化拖曳還原。

## PDF拖入

原48626會呼叫97101.y並把handleDrop/handleDragOver交給10764 Canvas；InkBridge前一版NativeCanvas只傳了節點拖曳／選單，漏傳這兩個事件。修改前以CDP受信任檔案拖放重現：dragover.defaultPrevented=false，未送達drop，PDF數量為0。

接回完整原97101 hook，不自行重寫檔案辨識、座標轉換、排版或PDF節點建立。原32760透過已有Electron webUtils取真實路徑→既有uploadFile及SHA-256 CAS→原PDFCard／instance建立及自有SQLite適配。新增原hook需要的getAllFiles讀取服務，回傳真實catalog及解析後metadata；沒有偽造成功。整個drop加入既有保存工作追蹤，沿用navigation/COMMIT排空。原97101 factory SHA-256：`f49f51f67615e0ca0ae7fbccf658ae0bc82dd47640f35e0323731cb3d1aff880`；32760：`47f73da6c7debdf3de29843f8308550a03d9468766ccb91c581fa3c62a432a6c`。

實測：

- `check-pdf-drop.cjs` 在明確的空白隔離白板，以真實磁碟PDF路徑送CDP dragEnter/dragOver/drop；事件isTrusted、路徑由webUtils返回，並非捏造File.path或直接呼叫建立PDF服務。
- dragover被原hook接受並為copy；一次拖放一張PDF卡片，實際CAS bytes及SHA-256一致，SQLite有對應實例。從原右鍵選單開原PDF閱讀器，真實Canvas出現且解析3頁，關閉重啟仍有實例。
- `INKBRIDGE_DROP_CHILD=1` 對額外白板窗口跑相同流程亦通過；沿用主writer，不另開資料庫。
- 原 `check-native-pdf.cjs` 的檔案選擇器、三頁解析、翻頁、加入白板、側欄／分頁閱讀與重啟回歸通過。

測試沒有操作檔案總管實體拖放；CDP提供受信任瀏覽器拖放與真實檔案路徑。沒有把其他所有媒體格式、遠端圖片下載、PDF匯出或拖進Lexical內文等未驗流程列為完成。

## 使用

正常關閉舊InkBridge，執行同一份 `inkbridge/Start-InkBridge.bat`。左上導覽鈕右方空白可拖動窗口；本機PDF可拖到白板空白處。回復本批以Git revert，不刪除工作資料或CAS。
