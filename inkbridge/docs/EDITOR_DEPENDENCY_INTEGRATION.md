# 0.4.0 第三方編輯模組整合

實際使用的官方Lexical模組全部鎖定0.53.0，原始碼與MIT LICENSE位於各npm套件的src/及LICENSE；package-lock.json記錄下載來源與integrity。InkBridge沒有複製另一版本的minified Lexical來與現有runtime混用。

| 套件 | 實際責任 |
|---|---|
| lexical / rich-text / history | 核心AST/selection、一般文字/heading/quote、歷史 |
| list | ListNode/ListItemNode、registerList、registerCheckList，含鍵盤及核取互動 |
| code / code-core / code-prism | CodeNode/CodeHighlightNode、Prism tokenizer、高亮及Tab/Enter/indent等官方handlers |
| link | LinkNode/AutoLinkNode與HTML importer；本輪尚未提供完整連結編輯UI或自動連結偵測 |
| table | Table/Row/Cell、完整registerTablePlugin及registerTableSelectionObserver，保留merged-cell資料，不註冊unmerge transform |
| selection | $setBlocksType，用於工具列區塊轉換 |
| markdown | 依賴已取得，但本輪未啟用Markdown貼上／快捷轉換，不列完成 |

原始碼整合位置：src/editor/lexical-editor.mjs。官方實作直接由npm依賴建置，沒有將專有FlexNote編輯器當成黑盒呼叫。

公開套件原碼、COPYRIGHT/LICENSE隨node_modules保留在測試成品；Electron及CanvasKit原有notice照既有封裝保留。不額外複製Windows系統字型至Git或成品；執行時從本機Fonts讀取。

自有邊界：保存協調／SQLite Commit ACK／獨立資料路徑、AST→Canvas adapter、Overlay幾何與工具列由InkBridge負責。原版41節點中的其餘類型、provider與附件／引用服務仍有整合工作，不能因新增依賴便稱全部完成。
