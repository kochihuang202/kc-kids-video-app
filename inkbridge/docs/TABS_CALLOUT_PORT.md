# 卡片內分頁與提示區塊：FlexNote 1.1.69 移植

## 已實作

InkBridge 0.5.14。基線為 Git `96e186e` 與保留的 0.5.13 可攜版。

- 在卡片編輯時輸入 `/tabs`，選取原生分頁項目：新增、切換、重新命名、圖示、刪除、拖曳排序及目前分頁均進入原有 Lexical → Commit ACK → SQLite 保存流程。
- 輸入 `/callout`，選取原生標註框項目：標題與正文分離、提示類型、Emoji 圖示、配色；白板顯示沿用新版原生 CanvasKit 排版。
- 保留完整的原生外掛、節點、選單項目、事件與清理函式，沒有另外製作替代 UI，也沒有替換既有 Lexical、SQLite Schema 或保存協調器。
- 主白板與真正獨立編輯視窗均可保存並正常關閉重開。兩台電腦使用新分頁前都應更新；舊版未註冊新節點，不能保證編輯新內容。

## 先確認的完整來源與依賴

來源為已安裝 FlexNote **1.1.69** 的唯讀 ASAR。`prepare-content-blocks.cjs` 驗證版本及兩份 renderer bundle 的固定 SHA-256，只擷取選定工廠、樣式與三種語系。專有工廠及產生後的完整程式留在 ignored private 目錄，不提交 Git。

| 來源 | 完整移植範圍 |
| --- | --- |
| 28988 編輯器 | 分頁 tK/tH/tG/tW/tV/t$/tQ/tY/tJ/t0 與六組完整宣告；提示區塊 ng/np/nx；兩個完整插入選單項目 |
| 94595、7957 | TabsNode、TabPanelNode、UUID、DOM 可見性、切換／尋找分頁輔助 |
| 80944、75098 | CalloutNode、標題／類型／圖示、DOM slot、舊標題轉換、類型預設值 |
| 55927、71560 | 完整 rich AST → Canvas 內容轉換與原生排版／繪製類別，包含分頁標頭、目前分頁正文與提示區塊 |
| 18043、97287、48718、95128 | 新排版類別使用的完整格式／內容／語系輔助依賴；既有 API 保留 |
| 27283 | 原生 Markdown 轉換，配合分離後的提示標題，避免誤把首行正文當標題 |
| CSS／翻譯 | 原版125條分頁、提示及 Emoji 選擇器樣式；zh-TW／zh／en 的相關原版翻譯 |

保留原有73866編輯器與41570 Lexical singleton；80636原生節點清單追加分頁類別。完整插入項目接入舊編輯器的共享選單產生器，因此沿用 slash 與 block 插入入口。Plugin 掛在原生相應位置，保留原先 onEditorReady、圖片操作等待、外部版本更新與關閉保存補丁。

兩個抽取 helper 會核對實際 imports、共同工廠作用域、唯一 AST 入口與產生後語法。原有 emoji 資料、composer context、UUID、圖示及其他已存在的原生依賴繼續使用；不引入第二套 React 或 Lexical。

完整來源合約與實際保存鏈分開驗證。REA 選定節點證據：`ev_62419516065f75c73af07e0eccf1bab3d2f388d084771dfc6ecdef88eac241ac`；此前編輯器比對：`ev_24977a80c27f0e4a6bebdc246b480b1288162fabb1d96fd2095fe8d728561346`。圖分析是有限範圍的靜態證據；實際操作結果來自下列隔離 Electron 測試，沒有啟動正式 FlexNote。

## 必要適配與實際修正

1. **避免文字 Tab 衝突**：原版 TabPanelNode 與 Lexical 原有文字 Tab 都使用 `type:"tab"`。新面板僅將 `getType`／JSON type 改為 `inkbridge-tab-panel`，並同步改原生 Canvas 轉換器的面板判別。保留所有 tabId、activeTabId、title、icon、children 及操作邏輯；既有文字 `tab` 節點保持原樣。
2. **共用 NodeState**：原版分頁連結會使用 blockId／blockLinked。重用舊編輯器 nZ/nW 的同一組設定物件，不在新外掛重建同名設定，避免 Lexical 以設定物件身分管理狀態時互相覆蓋。
3. **提示標題 Enter 焦點**：移植後重現按 Enter 選取正文卻仍把後續文字輸入標題。來源對照確認兩版 Lexical 都保留內部 input 焦點；原版標題 handler 沒有放開它。新增最小的 `input.blur()`，再執行既有選取正文動作，保留 `isComposing` 排除。這是明列的缺陷修正，沒有宣稱原版 runtime 已修好。
4. **舊提示資料**：保留原版一次性 titleDetached 轉換，移除正文裡與標題相同的舊標題片段。只開啟不製造共享 revision；真正修改後，透過既有保存流程持久保存新格式。

## 重建與還原

保留原有1.1.65 private baseline；只準備上述1.1.69元件，不覆蓋整份 vendor 或 ASAR。

```powershell
node scripts/original-reuse/prepare-content-blocks.cjs <FlexNote-1.1.69-app.asar>
node scripts/original-reuse/apply-integration-patches.cjs
node scripts/original-reuse/collect.cjs
node --test tests/content-block-generation.test.cjs tests/editor-169-port.test.cjs
node scripts/original-reuse/check-content-blocks.cjs
```

原版樣式抽取使用明列的 PostCSS 8.5.26 開發依賴。`content-block-source/receipt.json` 保留工廠與來源檔雜湊；`integration-patches.json` 保留修改前後雜湊。額外工廠透過明列檔名／雜湊清單接入 registry，遇到 ID 衝突、未知本地修改或來源漂移就停止，不任意掃描載入其他腳本。

每個修改檔保留 `.before-content-blocks`。程式回復不刪除／降級新分頁資料；舊程式不支援新節點，因此應保留此版本或相應 JSON／資料庫快照，而不是用舊編輯器覆寫新內容。

## 針對性驗收

- 保留的0.5.13可攜版跑相同新功能流程，停在原生 `/tabs` 入口不存在；沒有把舊版啟動成功當作已具備新功能。
- `content-block-generation.test.cjs` **6/6**：完整原函式／宣告、單一 command、共用 NodeState、實際選單與輸出介面、依賴及入口漂移拒絕。屬於產生器單元測試。
- `editor-169-port.test.cjs` **6/6**：既有回呼時機、停用、正常卡片節流及資源清理邊界。
- `check-content-blocks.cjs` 真實 Electron／Lexical／SQLite：原生 slash 插入、三頁不同文字、切換、新增、刪除、重新命名、Emoji、拖曳排序、標題 Enter 接正文、提示類型與自訂圖示、Ctrl+S、正常關閉重開、舊文字 Tab、舊提示資料、無初始化假版本、獨立 Windows 編輯視窗與再次重開、原生提示 Markdown 標題／正文各保留一次。開發版證據：`%TEMP%/inkbridge-original-modules-content-blocks-JJvjKd`。
- 直接相關回歸：`check-editor-169.cjs`、`check-native-exports.cjs`、`check-real-image-paste.cjs`、`check-mindmap-appearance.cjs`；涵蓋共用渲染／保存、原有 Markdown／Word 與附件輸出、實際圖片解碼與保存重開，以及繼承此渲染類別的心智圖量測。
- 檢查實際編輯及 Canvas 截圖。沒有跑不相關完整測試；沒有宣稱效能提升、硬體中文 IME、原版 runtime 對照或所有巢狀組合已驗收。
- 原生區塊連結選單保留；其外部協定、跨裝置／跨工作區導航不屬於這輪已驗收項目。原生 Markdown 未提供 Tabs transformer，分頁內巢狀提示的標題亦不能保證保留；本輪提示 Markdown 測試限定單獨區塊，沒有宣稱分頁的完整 Markdown 匯出／匯入還原格式。SQLite／快照保留完整結構。

## 可攜版與交換目錄交付

- 程式 commit：`42f74fdf6d65`；發布序號15；build ID：`bef0166b5723f33f084cecffee758da7cb70cec5481e9414f00b74553c4359c4`。
- 可執行入口：`release/InkBridge-0.5.14-42f74fdf6d65-18b8c0/Start-InkBridge.bat`。建置時 runtime source tree clean。
- 可攜版跑同一 `check-content-blocks.cjs` 通過，證據：`%TEMP%/inkbridge-original-modules-content-blocks-nRWuAw`。主視窗與獨立視窗均操作實際 copied runtime，正常關閉重開後新資料完整保留，包含分頁內巢狀提示。
- 可攜驗收發現：提示放在分頁內時，原生 Markdown 不能完整處理該巢狀格式。SQLite 保存及重開均正確；轉換測試明確限定單獨提示區塊，沒有改動或弱化任何既有歷史測試。
- 已向既有 `C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge` 發布兩份唯一簽章增量包，供0.5.12／0.5.13直接升級0.5.14。每份6,068,611 bytes、11個更新檔案；兩份皆經實際 Windows updater **Stage** 驗簽、基底／路徑／雜湊與暫存解壓驗證，再核對目的地複製雜湊。
- 0.5.12更新ID：`d71239e3-c702-4138-a029-a74542060111`；0.5.13更新ID：`ed2c42fb-6f9d-4f5e-b07b-9e15d7431355`。收據：ignored `release/content-block-delivery.json`。
- 以上證明本機交換目錄發布及更新器暫存驗證；不宣稱已上傳雲端或另一台已收到，也未重跑未修改的更新器完整失敗回復套件。snapshots、assets、正式 FlexNote 及正式筆記未被修改。
