# 心智圖 XMind 化（風格、按鍵、拖曳、剪貼）

2026-11-14，Asia/Taipei。使用者要求「完整照 XMind 的用法」，以下六項逐項經使用者確認（2026-11-13）。
原版 FlexNote 沒有這些行為，屬使用者同意的新設計；實作盡量重用原版的建立、版面、編輯、存檔與復原。

## 來源

- 風格數值取自使用者自己的 `出遊系列.xmind`（複製到暫存區解開，只讀 `content.json` 的主題），
  主題為 XMind 的 `Rainbow-#000229-MULTI_LINE_COLORS`。沒有把 XMind 的程式、檔案或圖示放進專案。
- 先前已唯讀檢查過本機 XMind 23.07 的主題與按鍵（見 MINDMAP_APPEARANCE.md、MINDMAP_KEYBOARD.md）。

## 行為

| 項目 | 現在 |
|---|---|
| 風格 | 預設「XMind 彩虹」：中心 `#000229` 白字；左右主分支共用固定 20 色，依中心主題儲存的順序依序分配，第 21 條從第一色循環；同一分支各層使用相同底色，文字依底色選擇明暗；中心到主分支 3px 曲線，其下 2px 圓角直角折線，從節點左右正中接出。舊的底線分支／框線／純文字仍可在工具列「導圖樣式」選 |
| ⊕ | 選取或滑鼠停留時不再出現，點擊區也移除；收合鈕「−」與數量不變 |
| 收合鈕 | 在節點右側正中（XMind 風格的連線接在正中，所以對齊）|
| 選取時 Enter | 新增同層節點並開始編輯；中心主題上則新增主分支 |
| 編輯時 Enter | 結束編輯，節點保持選取；Shift+Enter 留給編輯器 |
| F2／空白鍵 | 開始編輯（Tab 新增子節點不變）|
| 拖曳 | 放在節點的子節點那一側（右側；左側分支為左側）且與節點同高：成為它的子節點；放在上下緣：插在前後；放在節點上：成為子節點 |
| 節點工具列（2026-11-14 加） | 只選心智圖節點時，點一下不再彈出原版浮動工具列；右鍵時工具列與原版右鍵選單一起出現，選單自動移到工具列下方不遮擋；按工具列任一按鈕時先關閉右鍵選單；改選其他東西後再次隱藏。選其他類型（卡片、圖片…）照原版 |
| 顏色（2026-11-14 加） | 右鍵選單的色盤：選在主分支上，整條支線（節點與連線）換成該色；選在子主題上，它和它底下換色；中心主題改底色。色盤白色＝恢復彩虹預設。原版新增子節點會複製父節點顏色，所以改色時，底下仍是舊顏色的子節點一起換；自己另選過顏色的保留。顏色存在原版的 `color` 欄位，切到其他風格照原版顯示。色盤「+」打開的自訂顏色視窗會浮在選單上面 |
| @ 連結 | 彩虹樣式的 @ 連結依節點底色選擇黑白字色，圖示使用同色，文字加底線。搜尋選單開啟時可用上下鍵選擇並按 Enter 插入，選單關閉後 Enter 完成節點編輯。 |
| 剪下／複製／貼上 | Ctrl+X／C 複製整個子樹（系統剪貼簿同時放縮排大綱文字）；貼上到選取節點底下。剪貼簿已換成別處的文字時，每行一個子節點。選取中心主題時的複製與畫布上的貼上照原版（整張導圖）|

尚未做：XMind 的三種字級（中心 30／主分支 18／子主題 14pt，目前同字級）、直接打字取代內容進入編輯（中文輸入法下做不到可靠的攔截，請用空白鍵或 F2）。

## 實作位置

- `src/core/mindmap-appearance.mjs`：`xmind` 樣式（預設）、分支色與深度在版面計算時寫入節點、連線形狀／顏色／寬度與錨點。
- `src/core/mindmap-xmind-keys.mjs`：按鍵層，在原版之前攔截。全部以重送原版按鍵完成（編輯中 Enter→原版 Escape；選取 Enter→原版「編輯後 Enter」；中心 Enter→原版 Tab；F2／空白→原版 Enter），剪貼用 `paste` 事件與既有 `writeClipboardTextAndHtml`（宿主不給剪貼簿權限）。
- `mindmap-xmind-keys.mjs` 的 `installMindmapContextToolbar`：以 `visibility:hidden` 隱藏 `.selection-toolbar-container`（原版定位不受影響），右鍵後顯示；原版右鍵選單的 inline top 會被重繪，所以用 `translate` 下移；原版只在「外部點擊」時關閉選單，工具列按鈕不會冒泡，所以按下工具列時補一次 body click。
- 原版繁中語系把 `collapseChildren`／`expandChildren` 填成德文，`original-shell.mjs` 只在值完全等於那兩句德文時改成「收合子節點／展開子節點」。
- `src/core/original-mindmaps.mjs`：新服務 `inkbridgePasteMindmapNodes`，整批子樹一次提交，沿用既有驗證與循環檢查；預設樣式改 `xmind`。
- `scripts/original-reuse/apply-mindmap-xmind-patches.cjs`（由 apply-integration-patches 串接）：53861 拿掉 ⊕ 的繪製與點擊；10764 拖曳的子節點側判定。
- 復原：剪下與貼上前呼叫原版 `pushUndoSnapshot`。
- 顏色：`mindmap-appearance.mjs` 的版面計算取最近一個「與父節點不同」的 `color`（白色視為預設），否則用彩虹色；`original-mindmaps.mjs` 的節點更新把仍帶舊顏色的子孫一起改成新顏色。`installMindmapContextToolbar` 在右鍵選單開著時，把新加到 `<body>` 的浮層 z-index 提高到選單之上。

## 驗證（真實 Electron、合成資料）

- `check-mindmap-xmind.cjs`：預設彩虹配色與連線、⊕ 無點擊區、Enter 同層與結束編輯、中心 Enter、F2／空白、拖到右側成子節點、剪下／貼上／複製子樹（含系統剪貼簿大綱）／Ctrl+Z、外部文字貼上、重開保留。連跑三次通過；先前曾有一次未記錄原因的失敗，測試共用使用者的系統剪貼簿，可能受其影響。
- 既有測試依新規格更新後通過：check-mindmap-keyboard（進入編輯改 F2）、check-mindmap-appearance（底線樣式改為明確指定）、check-drawing-mindmap-menu（F2 與「Enter 結束編輯→Enter 同層」）、check-canvas-undo-kinds（原版整張導圖複製貼上照舊）、check-clipboard-history。
- 單元測試 92 通過、2 失敗，與修改前相同（#53 及啟動器／PowerShell 測試）。

未驗證：實體中文輸入法、大型導圖效能、左向／雙向版面的拖曳與配色細節、封裝版。
