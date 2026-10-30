# 0.3.0：編輯核心重整與 Gemini PRD 核對

2026-10-30（Asia/Taipei）。基線 `e917487` 與 `release/0.2.0-07d70c58/` 保留。本輪閱讀 Gemini PRD 的總目錄、Vol2 卡片及 Vol3 編輯，針對真實問題補查原版程式／CSS，不重新進行整份 REA，不執行 FlexNote，不修改正式資料。先重現、確認，再重製。

## 已重現的問題

| 操作 | 0.2.0 實測 | 原因與0.3.0處理 |
|---|---|---|
| `Alpha` → Shift+Enter → `Beta` | SQLite與AST正確，Skia變成`AlphaBeta` | 兩個函式各自只走direct text；改單一 AST block/run 投影，量測與繪製共用 NoteLayout |
| 35個真實Enter段落 | scrollHeight910 / clientHeight691 / scrollTop219；文字被內捲隱藏 | 取消百分比高度root；改intrinsic height/visible overflow，DOM採同一測量box；geometry/index/commit一起更新 |
| 點選文字第5個offset | caret落14或0 | Canvas傳實際client point；DOM掛載後取真正caret range，套Lexical selection並保留format/style |
| 標題／內文分欄 | 與確認的原版NoteCard結構不同 | 改成單一AST；DB title保留為衍生metadata，舊title/body/AST用冪等適配保留 |

上述前三項新桌面回歸先在舊版失敗，再在重整後通過。既有 Space/Delete/Ctrl+A/Ctrl+B 已實測有效，因此沿用公開 Lexical 與 SQLite 協定，沒有把所有鍵盤問題一概猜成事件穿透。

## PRD 校正：已確認、未確認及設計取捨

| Gemini PRD／既有敘述 | 程式證據與處置 |
|---|---|
| 獨立標題input與body | 原版NoteCard是一個AST編輯區；helper45828由heading/paragraph等抽title，最多60字。新空內容預設h1。撤除自行加的第二輸入框，保留舊資料metadata |
| 14px、1.6 | 原版95410支持可調全域預設；AST可覆寫，不能當全部節點固定值 |
| padding16 | 型別混淆：基類TextDrawer是16，一般NoteCard覆寫48、topPadding2。本輪NoteLayout使用已確認NoteCard規則 |
| 固定Segoe UI Emoji/JhengHei順序 | 不支持；原版是偏好＋Noto等。本版仍用本機系統字型，CSS與Skia指定同一組可用family，未宣稱字形與原版相同 |
| 520×200是所有建立入口 | 工具列／部分連線路徑支持；通用creator則520×480、scale0.9，drawer200只是fallback。本輪保留既有instance尺寸與建立介面，未全域改成單一假定 |
| 自動高度都由ResizeObserver決定 | 原版observer受普通Text/table等分支限制；NoteCard有Skia layout/getNodeBounds路徑。新實作以共享layout決定box，DOM intrinsic measurement只作安全下界，沒有height百分比回饋環 |
| 無條件focusEnd | 原版editor有clickPos→caretRange/PositionFromPoint→Lexical selection；focusEnd只是部分fallback。本輪按已確認路徑重製 |
| 同transform就完全無1px跳動 | 未獲runtime證據。原版DOM與Skia甚至有不同heading/paragraph margin；本輪不硬抄兩組不一致值，以Skia已確認的block排版作共享契約，測DOM實際box，沒有宣稱全字形像素相同 |
| 300ms自動保存＝異常關閉零遺失 | 不成立。timer只決定發起提交，真實COMMIT ACK才代表保存；斷電／crash draft journal仍未實作 |

原版heading Skia規則：h1/h2/h3字級倍率2/1.5/1.2，weight600/700/600，lineHeight1.58；top margin為實際字級×1.1/1/.9、bottom×.25。普通block top/bottom4，首block不加前間距，其餘取相鄰margin的max。原版DOM最終CSS的margin／部分lineHeight不同，未在有界來源中發現足以證實完全等效的補償。

### 查不到後的明確補足

已搜索10764宿主、34883 adapter、editor chunk95422中的scrollIntoView/skip-scroll-into-view/preventScroll/selectionchange/autoPan等。確認auto-height可見overflow、固定高度有scrollTop保存、focus補救preventScroll；**沒有確認一般長文caret超出viewport時的全域camera策略**。

因此本版自行補足一個具名且可替換的策略：auto-height不捲動隱藏DOM容器，必要時垂直移動自己的camera讓caret可見。這是InkBridge的有界fallback，不包裝成已確認原版演算法。固定高度scroll模式尚未加入。

## 新模組責任

- `core/rich-document.mjs`：完整AST／legacy適配、title推導、可讀block/runs；保留soft break、空段、Unicode、格式與未知metadata。未知節點明示，不靜默改為plain text。
- `core/note-layout.mjs`：單一Skia block layout，同一段落／格式／字型規則服務Canvas繪製與尺寸量測；所有builder/paragraph用finally釋放。
- `editor/lexical-editor.mjs`：公開Lexical掛載、真實DOM caret轉selection、IME flush、history；parse先於DOM綁定。
- `renderer/inline-note-editor.mjs`：一個owned session、開關序號與close Promise、overlay幾何、intrinsic reflow、caret fallback；不執行SQL。
- `renderer/workspace.mjs`：內容／metadata／instance更新、index與transaction staging。renderer draw不改資料。

舊筆記在顯示／編輯時用idempotent adapter形成單AST；只有正常編輯／保存才寫內容，原title/body資訊不被直接丟棄。啟動時計算現有卡片的新版幾何並經正常交易提交，未改schema。已有未知節點保留完整DB JSON並拒絕不安全編輯，仍能操作其他卡片。

## 原版證據身份（私人內容不提交）

主renderer SHA-256 `80f7143aab89e47e0106fa7da4f2733a8f6a640eb285a8f60dc39e707b2522e1`；ASAR `d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1`。

| 證據 | zero-based UTF-16範圍／位置 | SHA-256／用途 |
|---|---|---|
| module10764 | 2714420–3100150；2927443 observer；2931400–2936200 overlay | `ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6` |
| module34883 | 5534019–5538315 | `73c4a523c460a014c06bcfed06e3c6fdfc8d84bc901d849b53f2441842e98195` |
| module74137 | 3322728–3332748 | `8f6a1146c7644ff0f3fde380720504d48fd979ec1e9067f4ae742acbdc824bd4`；NoteCard padding48 |
| module71560 | 3118813–3248945；3181150–3182000 margin；3233100–3233910 heading | `9f930a2d36114c617cd840bec7ba03e47c13bd35b77ba9b21d144614ab0dc0b8` |
| module55927 | 3646229–3665895；3656984/3658861 softbreak | `e7e6eb614ba42e976b0d7c5e4e5a26ba033ee2352e3762c22180157af5f5525b` |
| editor chunk95422 | 273859 caret initializer；273878 clickPos | `a8d2213c24050c48016575007d3b9a79f786711da1f25c36102f9002e6f4403b` |
| CSS 0a3dd850c67b254e | 740412/740744/741197 auto-height；741589首block；745674精確paragraph | `118fd690a70b9c74fa82ac675e4e314b18fe24c1fb9991bb90ba7dbccf1b1a5e` |

Gemini把約293萬的overlay誤標module48626；該module實際8305630–8515142。本文只記行為與定位，不附原版專有程式片段。所有重構程式由InkBridge自行撰寫。

## 驗收與交付

重疊圖層修正前已執行：28/28單元、17/17實際Electron、14/14封裝操作通過。單獨500卡uniform四操作180樣本約59.67–60FPS；dense約58.70–60FPS。這些數據對應各raw report中的source hashes，不作原版效能相同證明，也不冒充最後補丁的完整驗收。

人工檢視實際截圖另發現：長高的編輯卡與後方卡片重疊時，DOM文字在上層，但Canvas底紙仍按原z排序被後卡蓋住。已新增實際WebGL像素回歸並調整編輯卡底紙最後繪製，保留資料z不變。先前審查因spend cap受阻；使用者表示恢復後已正常重試，沒有繞過審查。舊排序取到後方圖卡RGB[141,172,156]，修正後取到紙張[255,254,251]，回歸先失敗後通過。

**最後驗收：28/28單元（含9項AST適配）、18/18實際Electron桌面（1.4分鐘）、15/15新封裝EXE操作（35.0秒）全部通過。** 已親自檢視實際截圖，未把自動化通過取代畫面檢查。測試使用隔離資料；正式FlexNote沒有啟動或修改。物理IME／全PRD完成度仍不作已驗收。

最終成品：`release/0.3.0-4fb432ee/InkBridge-win32-x64/InkBridge.exe`。需保留整個資料夾。EXE SHA-256 `7b67566e28ee307ce2639b44a77621c35271218eaff3f12c6f88c7759c71bbe7`；25個來源／bundle／WASM組件hash見`benchmarks/build-0.3.0-manifest.json`。`0.3.0-8d1ec172`保留為修正前候選版，不能用同EXE hash推論外部程式來源相同。

### 更新PRD後的編輯優先序

已再讀更新後Vol0（目前共17卷）、Vol3、Vol14與Vol16編輯追蹤項目。優先完成：

1. 單AST、caret／IME、Enter／Shift+Enter、auto-height、編輯圖層、保存與重開的核心穩定性；先補跑上面的重疊回歸。
2. 基礎區塊與文字操作：標題／段落／引用、選取氣泡列、列表與待辦、局部選取／Undo；對照原版來源後分項實作。
3. HTML／Markdown貼上：先確認設定預設、型別優先序與轉譯入口，確保未知節點不被清空，再擴展支持。
4. 表格、折疊、Callout、代碼／公式、行內附件按來源與相依性逐項加入；暫不分散到Mindmap、PDF或連線。

Vol14的字體棧與單AST管線可與既有證據對照；「百萬字不卡頓」「完全相同數值因此無1px跳動」仍沒有本次runtime支持，26種節點也只是原版研究清單，不等於InkBridge已支持。Vol16的完成標記以真實測試為準，不直接照抄。

## 尚未完成的Vol3／產品功能

本輪重整核心輸入、顯示與保存邊界；不是完整PRD已實現。Slash完整選單、區塊把手／排序、表格／欄寬操作、折疊、Callout、公式、代碼高亮、完整文字顏色／字級樣式、行內附件、完整氣泡列／多板UI等尚未加入。原有新增dialog尚未改成原版完整工具列拖放／直接新卡流程。現在不假稱圖片、PDF或所有Lexical Node都可編輯。

物理Windows注音／拼音、原版同場景runtime對照、任意字體／字級／DPI的字形級零跳動、長時間連續IME耐久與新版完整10分鐘soak均尚未驗收。0.2.0的耐久結果保留但不冒充本版。
