# 0.7.5 編輯排版與黑色外框

## 修正與來源

核對已安裝 FlexNote 1.1.70（ASAR SHA-256 55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b），以同一張合成標題／待辦卡片重現編輯切換。

一般清單的 padding-left 選擇器覆蓋待辦專用樣式，從4px變成24px。移植新版原有的 :not(.PlaygroundEditorTheme__checklist) 排除條件，保留原有待辦字級、行距及勾選互動。DOM與Canvas文字寬度、縮排以相同世界座標量測，不用另一組任意字級補償。

依新版完整74137 NoteCard繪製流程補入 editingNodeId 分支；沿用既有strokePaint與清理順序，編輯時亮色主題黑框、深色主題白框，保持2.5螢幕像素寬；一般選取色不變。沒有替換整個Canvas或Lexical。

來源私有副本 edit-parity-source 及原始CSS有留存；針對74137的REA靜態證據 ev_8f4b8cc04852372a559bd6e248cf8b69e8089d5f086ad2b9e2147765c820900a，依賴沿用已存在的71560、89676、93635及Canvas傳入editingNodeId。這是選定來源的靜態分析，不代表完整應用所有功能均驗證。原版專有原碼與私人筆記不進Git。

## 相關驗證

- check-edit-layout：修正前24px斷言失敗；修正後4px、相同文字尺寸與縮排、實際黑框像素、中文Ctrl+S、重開及進出編輯不新增版本通過。
- check-editor-169：正常卡片／心智圖編輯、保存ACK、重複flush不增版、異常釋放、重開通過。先前測試錯用Enter新增同層，依既定REG-150改用F2編輯原節點，未放寬保存斷言。
- check-content-blocks：分頁、提示區塊、原Tab、獨立視窗、Markdown與SQLite重開通過。
- 僅合成隔離資料，正式筆記未修改。

## 交付

封裝與OneDrive交付收據完成後記錄於此。
