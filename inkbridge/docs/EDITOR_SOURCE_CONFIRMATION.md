# 編輯器來源核對與整合範圍

2026-10-30，Asia/Taipei。規則以 AGENTS.md / DEVELOPMENT_WORKFLOW.md 最新使用者決定為準。沿用既有 REA；沒有啟動正式 FlexNote，沒有重做整份分析。

## 原版來源身分

- FlexNote 1.1.65 ASAR SHA-256：d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1。
- `_app-504fc5b62d4836de.js` SHA-256：80f7143aab89e47e0106fa7da4f2733a8f6a640eb285a8f60dc39e707b2522e1。
- Editor lazy chunk `95422.e9eba97f30d67d4f.js`，306570 bytes，SHA-256：a8d2213c24050c48016575007d3b9a79f786711da1f25c36102f9002e6f4403b。
- 原始切片／含原碼分析留在 private evidence / ignored artifacts，不提交到公開交付歷史。以下 offset 是 main renderer 的 UTF-16 索引，end exclusive。

## 優先重用的實際處置

| 來源 | 已確認內容 | 本輪處置 |
|---|---|---|
| 原版 module80636，factory[5636903,5638144)，SHA 3df8c2d592a83c02004e484db1800d40237d907479762f1af633e95c8a7e1a12 | 41 constructor entries：26 custom + 15 others；不是只有 Heading/Quote | 接回已確認有公開來源的標準節點與完整官方 handlers。沒有把註冊數等同功能完成數 |
| editor chunk module73866 default=iL | 包含設定/shared history/flash/table provider、LexicalComposer，iv 才是內部編輯組件；props 含 onChange/editorBlocks/disabled/autoFocus/clickPos/cardId/cardType/position | 原碼存在，不當作找不到；尚未驗證它能離開原 Redux、i18n、app plugins 獨立掛載，故沒有把 iv 一段剪出來假稱完整重用。完整自訂編輯宿主依賴仍待接通 |
| 公開 Lexical 0.53.0 套件，MIT LICENSE／src 隨 npm 保存，lockfile 固定完整性 | Heading/Quote/List/ListItem/Code/CodeHighlight/Link/AutoLink/Table/Row/Cell；List/Checklist/Code Prism+indent/Table selection handlers | 直接重用完整官方實作，不自行寫 HTML parser、清單鍵盤核心、程式碼 tokenizer 或表格選取核心。不是宣稱已證明它與原版 vendor build 完全同版 |
| 原版55927，factory[3646229,3665895)，SHA e7e6eb614ba42e976b0d7c5e4e5a26ba033ee2352e3762c22180157af5f5525b | S.toRichTextLines[3650170,3665511)：AST → 非平凡 rich lines，包括 table/nested lines/code/link/linebreak | 來源已取得；不是只有 flatten string。InkBridge 目前的 projection 是自己的適配器，不冒充整個原版 converter |
| 原版71560，factory[3118813,3248945)，SHA 9f930a2d36114c617cd840bec7ba03e47c13bd35b77ba9b21d144614ab0dc0b8 | TextDrawer eQ，renderer eF.layout[3179792,3226787)、mapTextStyle[3230405,3232694)，直接引用約30個模組及 fonts/assets/embed/config/cache | 不是兩個可 drop-in 的純函數。依已確認標準節點規格延伸現有 Canvas 適配層；未導入的26 custom、資產與引用服務保持未完成，不能稱原版完整引擎已移植 |

本輪新增的 Canvas adapter 是 InkBridge 程式；官方套件是實際重用的原始碼。兩者不可混稱「已完整拷貝 FlexNote」。沒有另外建立第二套富文本編輯核心。

使用者提到約25%需要逆向；本輪沿用既有結果，但未找到該數字的統計母體與版本定義，不把它當已驗收比例或重查的理由。

## Gemini PRD 交叉核對

已讀 editor Vol3、Vol14、Vol18，沿用 Vol16 tracker 作待核對清單。PRD 是需求／研究主張，與實體證據不一致時記錄差異，不直接套用。

- Vol3 padding16 與 NoteCard 實體覆寫48、topPadding2不同；已沿用已核對的 NoteCard 值。
- Vol3 固定 Windows font 與 Vol14 Noto fallback不是同一契約。本輪使用 Windows 實際字型、DOM/Skia 共用 family；程式碼另載系統 Consolas/Courier，沒有宣稱與原版字形相同。
- Vol14 的「幾何零跳動」「百萬字不卡」「300ms保存等於意外關閉零遺失」沒有相應 runtime 證明，不作驗收結論。
- Vol18 題稱41項；標準表實際只列12項，自訂表未列 mermaid。原版另有 hashtag/overflow/mark；不因表格漏列便略過研究或宣稱全部支持。
- Autocomplete 註冊只證明 class 存在，隱藏 DOM/exclude copy 不足以證實 AI ghost UI。
- 原版 mention Markdown 有 FlexNote URI objectId/type 證據，不等於任意 `[[title]]` 查找。
- 原版 callout Markdown 已確認 `> [!TYPE]`；Vol3 的 `! ` 或 `:::callout` 不是目前已證實的同一貼上規則。
- details/summary 有 collapsible importer 證據；`>> ` 貼上轉換未因此成立。
- Mermaid transformer 名稱存在，但 replace 目標需 runtime 釐清；不假造已驗證 Mermaid AST。

## 貼上路由：原版已核對

1. 檔案優先受 files、HTML/plain 是否存在及下游 handler 是否消費所約束，不是看見 files 就無條件攔截。
2. rich MIME：matching namespace + 合法 nodes array → HTML（不是與 plain 完全相同的字串）→ plain → URI。不是所有 namespace 的 JSON 都能直接注入。
3. Markdown 自動轉換預設 false；關閉仍可能提示轉換。開啟僅處理像 Markdown 的純文字且 HTML 非語義／非 data-lexical 的情況，不能覆蓋有效富 HTML。
4. 原版 post-process 保存 before state / dirty leaves，僅替換本次貼上區塊；不得轉換整張舊筆記。
5. window.batchImportFromMarkdown 是位置／匯入 Modal 路徑，不是一般 Ctrl+V。其200ms timer不構成 flush/commit ACK。

來源：main43991[9558299,9567764) MIME/import；10977 file/paste；78556 file detector；main27283[5540552,5558216)標準 Markdown、34771[5699109,5705403)擴充轉換；editor chunk242720–246600 post-process。這些是靜態證據，未作正式原版 runtime 操作。

InkBridge本輪保留公開 Lexical 的正常 rich MIME/HTML/plain 路由；新增已知未支持 rich HTML 及本應用 internal AST 的 preflight，防止 import 前失去結構。Markdown自動轉換、提示及自訂轉換管線仍未接通；純文字 Markdown 保持原文，未宣稱轉成語義節點。

## 本輪確認的失敗與修正

基線 `857df67` / 規則後 `7173e46`，0.3.0：實際 Ctrl+V 貼上40段中文與 pre/code、ul/li、table，AST只有 root/heading/text/paragraph/linebreak，清單、程式碼、表格語義遺失。並非靠 unknownTypes 就能補救：HTML importer在AST生成前已提升children。

新增 maintained rich-paste.spec.cjs 基線：3項中2過1失敗，失敗在 `ul/li structure must survive paste`。100段基礎heading/paragraph以及HTML優先本來已過，沒有把它們算成本輪修復。

公開 Lexical 本地來源：rich-text registerRichText → clipboard import extension → html $generateNodesFromDOM；LexicalEditor 僅收已註冊 Node.importDOM，沒有 converter 時 html 會提升 children。

本輪接上標準 Node/importer/handlers，完整 JSON 經既有 Commit ACK 保存；projection 保留 list topology、code tokens/language、link URL、table row/col spans/widths；Canvas 能畫標記、程式碼底色、引用線及表格 cell。文字樣式只實作列出的有限子集，不能稱所有原版 style 規則完全相同。

## 共用量測中已確認的原版規則

- h1–h6 size factor：2、1.5、1.2、1.1、1、.9；weight600、700、600、600、600、600；lineHeight1.58；top以實際字級乘1.1、1、.9、.8、.7、.6；bottom乘.25。main3233055。
- 相鄰block margin取max，首block無前margin。一般block4/4；code12/8；list1.6；code1.775。
- table欄寬超可用寬度按比例縮小；cell內容寬減24，左右12；高度加16，上下8；最小row高round(fontSize*1.6)+16；合併row不足高度補最後一列。main3182080起。
- TextDrawer內部fallback16/1.585與外部常見NoteCard14/1.6不同，不能混用。
- Skia原版普通text predicate接受text/code-highlight/emoji/hashtag，未見獨立tab分支；InkBridge明確保留TabNode，並非宣稱這是原版同一行為。

## 完成範圍與未完成範圍

已接通並有桌面測試：H1–H6的節點能力／H4工具切換、粗體/斜體/底線/刪除線/行內code基礎格式、HTML清單/連結/code/table保真、待辦勾選、code Tab/Enter/Undo/Redo、表格Tab/ShiftTab、SQLite重開、100段長文、已知不支持rich內容拒絕貼入。

尚未完整驗收：所有格式組合與全部glyph幾何、多層list/merged-table的視覺完全對齊、長時間富文本編輯的穩態記憶體、實體注音輸入法、原版runtime像素/效能對照。

仍待整合：Markdown設定／貼上轉換、HR/hashtag/mark/overflow、26自訂節點及其完整provider/services、block grip與slash／氣泡選單、表格欄寬拖拉／增刪選單、code語言/行號/複製UI、公式/圖表/附件/卡片引用、固定高度模式。原碼存在者繼續追依賴，不視為找不到後自行簡化的許可。

一般長文caret auto-pan仍是0.3.0遺留的InkBridge fallback；原版策略未確認，本輪不再改其演算法，也不宣稱已對齊。完整編輯PRD尚未完成。
