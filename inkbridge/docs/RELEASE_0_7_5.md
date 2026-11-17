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

最終封裝版再次通過 check-edit-layout，隔離資料 edit-layout-OS4iJo；實際畫面存於私有 edit-layout-evidence。發布序號26，build ID cc4f447dfa4938b25aa548e9512bbce562cf4ecdc06f9fe4bb53806e0da03b2f。

- 完整ZIP InkBridge-release-0.7.5-25162303-e658-4067-bdd2-29c10743731d.zip，232964238 bytes／2305檔；SHA-256 000f494893527abb83eee8085fb0ca42b7eab23ef1e77bd95a299bbccab818ac。
- 0.7.4增量ZIP InkBridge-update-85901f68-33e9-4d69-94db-cbd0aa453995.zip，7159615 bytes／6檔；SHA-256 6f2b9e512b515440cd59d90e8ffe9c3ad1b7057befb8168442b32a11d1aa4bec。
- 兩包每檔簽章與雜湊通過，隔離PowerShell Stage通過且原安裝未改；source backup留於私有開發區，不進可攜資產。
- 已寫入指定OneDrive交換根目錄並核對雜湊，舊0.7.4完整包已清除，資料快照、附件、診斷與舊增量包均保留。雲端及另一台到達時間由OneDrive決定，未操作另一台實機。收據 release/delivery-0.7.5.json。
- 使用0.7.4可從程式內更新；或解壓完整ZIP到本機程式目錄，執行內含 Start-InkBridge.bat。交換目錄只放ZIP。
