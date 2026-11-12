# 白板內搜尋（右下角搜尋按鈕）

2026-11-12，Asia/Taipei。分支 `claude/inkbridge-board-search`，基線 `0b108ce`。

## 使用方式

白板右下角控制列的放大鏡開啟搜尋面板，再按一次關閉。輸入關鍵字（空白或逗號分隔多個）
後列出命中的卡片數；Enter／下一個／上一個逐張跳轉並置中，命中的文字在畫布上標示。
X 清除關鍵字與標示並關閉。白板搜尋沒有「取代」。

## 來源與接合

| 來源 | 內容 | 修改 |
|---|---|---|
| 46979.ZP | 右下角控制列的搜尋按鈕；送出 `22676.Tx({show,position:'.react-flow',isWhiteboardSearch:true,hideReplace:true})`，已開啟時送出關閉 | 無；宿主只把按鈕加入允許清單 |
| 42713.h | 完整搜尋面板：關鍵字切分、300ms 延遲、`94700.Vj` 取卡片文字比對、`23.tN().fitView` 跳轉、`22676.EK` 寫入高亮 | 無 |
| 64744 ox／oE | 原版 App 外層以 `keywordSearchPanelParams.show && <42713.h/>` 掛載 | 宿主以相同條件掛載 |
| 10764 → 66597 → 71560 | Canvas 把 `ui.keywordSearchHighlight` 傳給繪製器，`drawKeywordHighlights` 畫出標示 | 無 |
| 48626 | 搜尋開啟時不啟用「縮小只顯示標題」 | 無（先前已移植） |

宿主改動只在 `scripts/original-reuse/original-shell.mjs`：允許搜尋按鈕、`NativeKeywordSearch`
掛載面板、`NativeKeywordHighlightRepaint`。沒有修改任何原始 factory，不需要重新 collect。

快捷鍵 `OPEN_SEARCH_PANEL` 在原版是全域搜尋（`22676.q1`），不是白板搜尋；本次未接，維持既有排除範圍。

## 宿主補充：高亮重繪（使用者 2026-11-12 決定）

原版 66597 靜態圖層的 `computeHash` 不含搜尋關鍵字，未被滑鼠觸碰的卡片沿用快取圖，
71560 的高亮不會重畫；實測只有游標移到卡片上才出現。目前安裝的新版 FlexNote
（app.asar SHA-256 `5b15c140…`）靜態核對，該段快取鍵相同。沒有執行原版 runtime 對照，
不能排除原版另有未找到的觸發點。

經使用者確認後補上：`ui.keywordSearchHighlight` 變更時呼叫原版 `22818.xB.bumpEpoch()`
（該世代值已在原快取鍵內），使靜態圖層重錄。這是宿主自行加入的行為，不是原版程式。

成本抽查（合成 300 卡、25% 縮放全部可見、全部命中）：高亮變更後三個畫格 250–380ms，
閒置三個畫格約 67ms。每次切換結果都會重錄一次；更大白板未量測。

## 照搬的原版行為（未修改）

- 比對使用帶 `g` 旗標的正規表示式連續 `test()`，會依卡片順序漏掉部分命中
  （探測中兩張命中卡片曾只得到 1/1）。
- 在輸入框按 Esc 只關閉面板，儲存的高亮不清除；X 才會清除。

## 驗證

`node scripts/original-reuse/check-board-search.cjs`（真實 Electron、暫存合成工作區）：
原按鈕開啟、掛載於 `.react-flow` 內、無取代鈕、兩張命中、Enter／上一個循環與置中、
高亮像素實際畫出（游標未碰卡片）、無結果時清除、Esc／再按按鈕／X 關閉、內容未被改寫、
無頁面錯誤。相關既有回歸 `check-shell.cjs`、`check-native-resize-lod.cjs` 通過。

未驗證：封裝版、深色主題、Mindmap 節點、實體輸入法輸入關鍵字、大型白板效能。
