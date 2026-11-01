# 多選工具列與卡片右鍵選單接入

2026-11-02；基線 ee969f5。

## 原版證據與修改

原版48626將14153._作為Canvas10764的multiSelectionToolbar，傳遞選取內容、selectionBounds、tempCtx、白板ID、節點與連線setter、fitView/fitBounds及undo入口。原版90214.av管理節點右鍵事件、選單座標、視窗邊界修正、外部點擊與清理，renderMenu建立95077等對應型別原選單。

InkBridge既有掛載漏掉兩者。board.mjs新增小型NativeCanvas邊界，在既有Router/Redux/CanvasHost/FlowContext之下掛載完整原元件。沒有修改正式FlexNote、私有工廠或原版Canvas演算法；沒有重新設計UI、假服務或改寫資料格式。沿用既有batchUpdateCardInstances與updateNoteCardInstance的SQLite COMMIT流程。

原工廠SHA-256：

- 14153: d118ff88eaf474e5a5afafe4474f2ff819234fc06523424609bbd0cb620a4e70
- 90214: bbe2c82267d2c0926f232e7465a4353d6bd5674e7ef856b7a8d17f48945f0c09

## 實際測試

`node scripts/original-reuse/check-native-multiselect-context.cjs`

真實Electron及滑鼠/Shift操作：兩張、三張選取數量與工具列；批次收合、展開、自動高度寫入全部三張卡片；右鍵第一張切換自動高度；右鍵第二張切換高亮頭部且不改到第一張；右鍵拖曳空白處平移不叫出選單；正常關閉與重新開啟後完整graph相等。資料在TEMP的inkbridge-original-modules-multi-*，不操作桌面正式profile。

同一測試暫時套用Git基線board.mjs，確實因找不到multi-selection-toolbar-container失敗，finally立即恢復修正檔。第一次受限沙箱Electron測試未完成，不算基線或成功證據；後續均在允許桌面執行的環境完成。

相關回歸：check-card-toolbar-menu的before OS clipboard子集，驗原生36色色票、改色、高亮頭部、自動高度、收合、固定與重啟。未重跑無關完整套件。

## 驗收範圍

已驗入口及上述真正操作，不宣稱每個批次選單功能完成。分組createSection、批次匯出等仍需各自完整資料模型/服務與專項驗證；既有undo入口仍待實作。PDF匯出依使用者要求暫緩；獨立Windows編輯視窗與轉心智圖不在本次修正。背景空白處右鍵選單沒有在這次啟用。原版右鍵選單本身包含既有未完成選項，這次不把它們標為已驗收。

啟動：Start-InkBridge.bat。已開啟的舊程式需正常關閉後重新啟動才載入新程式；測試未強制關閉使用者既有視窗。
