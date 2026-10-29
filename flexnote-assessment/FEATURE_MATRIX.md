# FlexNote M0/M1 功能與證據矩陣

評估日期：2026-10-30。範圍：產品研究、REA／AST靜態逆向、唯讀本機調查、隔離資料轉換與共享資產快照原型；沒有修改原版程式或正式筆記。最新需求採保留Knex＋SQLite、snapshots/＋assets/、唯一parent鏈與運行中保存協調；明碼只作匯出保障，見ARCHITECTURE.md。

證據標記：**L**＝本機檔案／資料或實際測試確認；**O**＝官方文件確認；**I**＝依證據推論；**U**＝尚未確認。L 的靜態資料證據不等於 UI 執行驗證。

## 功能

| 功能 | 官方設計／本機證據 | 改造狀態與驗收 |
|---|---|---|
| 筆記卡片、富文本 | O：區塊式正文與嵌入；L：noteCards，前三筆正文 JSON 根鍵為 root | 資料列往返通過；Markdown 投影、原版重新開啟未驗證 |
| 白板與跨板引用 | O：內容與實例分離；L：noteCards / noteCardInstances；主要庫有 23 張卡片出現在多塊白板 | 實例 ID、objectId、whiteboardId、座標等欄位逐值往返；互動未驗證 |
| 白板渲染核心 | L：CanvasKit/WebGL glue、自訂CanvasEngine、空間索引裁切、LOD與picture/snapshot caches；存在configureCanvasHost | 已靜態確認；未量測100/300/500卡片或實際GPU路線 |
| 白板嵌套、分區、連線 | L：whiteBoardList、whiteboardInstances、sections、connections | 資料往返通過；端點語義、Undo、拖曳未驗證 |
| Mindmap | O：白板 Mindmap 與 Markmap 流程不同；L：mindMaps、mindMapInstances、mindMapNodes，含 childNodeIds / objectId / 折疊狀態 | 資料往返通過；Tab / Enter / 中文 IME、Xmind 實測留至 M5 |
| 標籤、資料庫、屬性 | O：多視圖、篩選排序；L：tagList、cardTagList、collections、collectionViews、properties、關聯表 | 資料往返通過；視圖查詢與排序語義未驗證 |
| PDF、高亮 | O：PDF 與頁面位置引用；L：pdfCards、noteHighlights、highlights 等 schema | 有值表逐值往返；零列不算功能驗收；PDF 檔案與定位未實測 |
| 圖片、影音、影片高亮、附件 | O：來源定位及獨立檔案；L：files、mediaCards、mediaCardInstances、videoHighlights 等 | 只驗證資料列；原始二進位檔案讀取、雲端佔位檔與解碼未驗證 |
| 網頁卡、便簽、文字、形狀 | O：各為白板元素；L：textElements 等；本原型 allowlist 未覆蓋所有類型 | 非完整遷移；須補完整物件清冊 |
| 雙向連結、塊嵌入 | O：提及、嵌入、塊連結語義不同；L：正文mention/embed-card、instance.objectId、findTargetsByCardIdAndType | 已追查主要讀取與hydrate補載；非單一引用表，未做完整反向關聯驗收 |
| 搜尋、AI | O：本機知識檢索；L：vec_chunks 虛擬表及 shadow tables | vec0 未載入；索引未遷移；AI 模型／會員依賴未驗證 |
| 日記、待辦 | O：官方提供；本機 quickNotes 等 schema 不足以推定日記實作 | 待辦／日記 UI 與 schema 完整映射未驗證 |
| 歷史、備份 | L：主庫374筆正文歷史、41筆白板歷史；81919逐表JSON ZIP且排除特定索引，打包函式不含附件原檔 | 原生全庫快照可保留；官方ZIP合併恢復不等於精確整庫還原 |
| 雲同步 | O：OneDrive API、S3、WebDAV、百度；L：77691傳輸、81919備份／合併、18291另有uploadFileToS3 | 已做部分靜態追查；未調用或變更。新方案改外部快照交接，不刪原版程式碼 |
| MCP | O：讀寫工具與唯讀設定；L：有官方 stdio bridge、設定 enabled=false，39125 TCP 不通 | 連線嘗試失敗；未 initialize、未 tools/list、未呼叫筆記工具 |
| 原生一致性備份 | L：隨附node-sqlite3 Backup API已對9個私人副本備份／回建，完整DB影像hash及schema相同 | 9/9 integrity通過；不是跨庫同時點／原版UI重開 |
| 共享附件與版本分支 | L：隔離原型實作不可變hash資產、UUID snapshot/parent、掃描／load／rollback | 11項Node測試通過；沒有真實OneDrive或正式editor接入 |

## 本機證據索引

- **L1 安裝**：`C:\Users\ji3cp\AppData\Local\Programs\flexnote\FlexNote.exe`，ProductVersion=1.1.65.0、FileVersion=1.1.65。`resources\app.asar` 為 276,341,400 bytes。Electron 授權與 Chromium/V8 資源存在；Electron 精確版本未查。
- **L2 資料**：`C:\Users\ji3cp\AppData\Roaming\flexnote`，有 main.db、8 個 db_*.sqlite3、IndexedDB 及快取。SQLite backup API 對各工作空間取得一致的單庫快照；不保證跨庫及附件同時點。
- **L3 檔案根目錄**：本機設定 userFilePath 指向 `C:\Users\ji3cp\OneDrive - Foxconn\01_Home\20_FlexNote\FlexNote`；觀察到 files、backup、client-info JSON。這已在 OneDrive 路徑內，**不代表位於 Roaming 的主體 SQLite 已由桌面 OneDrive 同步**。未變更此路徑。
- **L4 隨附資料遷移檔**：安裝目錄 `resources\migrations\20241001122452_init_db.js`：noteCards 84 行起、noteCardInstances 101 行起、connections 125 行起、mindMaps 183 行起、files 213 行起、mindMapNodes 530 行起。`20250521013426_mindmap.js` 定義 fileInstances；`20260928093000_whiteboard_content_versions.js` 定義歷史布局表；`main-db\20241001122452_init_db.js` 說明全域與分空間資料庫。
- **L5 MCP**：Roaming 中 mcp-server.json 的非機密欄位與 TCP 檢查；bridge 位於安裝目錄 `resources\resources\mcp\flexnote-mcp-stdio.js`。沒有將 token 寫入本專案。
- **L6 REA**：已連接 rea-agents 6.5.0 / skill 42。Windows x64 可做 SQLite、ASAR/JS 靜態分析；Ghidra 未設定、macOS 專用 UI/追蹤不可用。實際 SQLite schema inspection 證據：`ev_31b1a6f9a45a4cc78a5b9f4351d5b1d4e75e28540cd8b711ce642b29274303e7`，88 個 table inventory（含虛擬／可能 shadow 表），不是 88 個已遷移表。
- **L7 私人測試**：`C:\Users\ji3cp\.codex\visualizations\2026\10\29\01a1886a-23bf-75e2-85c6-b497ce388c5e\flexnote-private-probe-v2\summary.json`，8 庫、268 次表往返、10,362 列通過。快照、JSON、回建庫均未納入 Git。REA 完整證據另存同層 flexnote-sqlite-evidence.json。

## 官方來源索引

- [官網](https://myflexnote.com/)／[繁中文件入口](https://wiki.myflexnote.com/zh-Hant)：功能及效能宣稱；不作內部架構證據。
- [卡片](https://wiki.myflexnote.com/zh/tutorial-basics/card)、[白板](https://wiki.myflexnote.com/zh/tutorial-basics/whiteboard)、[Mindmap](https://wiki.myflexnote.com/zh/tutorial-basics/mindmap)。
- [編輯器](https://wiki.myflexnote.com/zh/editor)、[標籤](https://wiki.myflexnote.com/zh/tutorial-basics/tag)、[搜尋與連結](https://wiki.myflexnote.com/zh/search)、[高亮](https://wiki.myflexnote.com/en/tutorial-basics/highlight)。
- [備份](https://wiki.myflexnote.com/en/data/backup)、[同步](https://wiki.myflexnote.com/zh/cloud-sync)、[MCP](https://myflexnote.com/zh/blog/flexnote-mcp)。
- [更新紀錄](https://myflexnote.com/zh/releases)：1.1.65（2026-10-27）擴充 AI/MCP 白板能力；1.1.62 修正畫布關閉與 Mindmap 關聯；1.1.61 改善大 PDF 索引；1.1.59 減少選卡及虛擬引用更新；1.1.57 卡片庫縮圖；1.1.54 布局歷史；1.1.53 MCP；1.1.52 程式鎖定；1.1.51 備份恢復唯讀問題；1.1.49 Undo/Redo 修正。上述不是本機效能實測。
- [服務條款](https://myflexnote.com/terms)，2026-09-23 生效，§6 使用者內容權利、§8 同步、§9 逆向限制與法律例外。使用者後續指示開始逆向，本輪已讀封裝JS及AST，未patch核心；此指示不等於取得第三方程式碼的修改／散布授權。最新方案沿用原版，不需重編專有核心。
- [官方GitHub README](https://github.com/flexnoteapp/flexnote/blob/main/README.md)：明確說應用原碼未公開、無開源license；GitHub connector取得README blob SHA 3dc78dbe370ea89397edb4024dcbc5dc1d5c4d10。

## 本輪逆向與版本證據（L8起）

私人分析根目錄：`C:\Users\ji3cp\.codex\visualizations\2026\10\29\01a1886a-23bf-75e2-85c6-b497ce388c5e`。本表offset一律零起算UTF-16、end-exclusive；不是行號。scan_js.py的搜尋offset則明標Python Unicode code point，兩者不可混用。

- **L8 來源身份**：ASAR SHA-256 d635fc44f4467be28375ac0fa0ed4280c7d8b80cd49734e15cf85d6e900a7ed1，16,175成員；background.js SHA 9ed2877f59d645f75a27ecc517458b370ae1425227b61221c9c04489ff75f72f；前端_app SHA 80f7143aab89e47e0106fa7da4f2733a8f6a640eb285a8f60dc39e707b2522e1。各私人目錄inventory／receipt記成員及切片hash、來源byte/UTF16範圍；切片只包裝完整AST函式，沒有執行bundle。
- **L9 版本與格式**：ASAR實際knex/package.json=3.1.0、sqlite3/package.json=5.1.7；隔離載入隨附node_sqlite3.node，只讀binding VERSION=3.44.2、VERSION_NUMBER=3044002。binding SHA d4f1bb101605b31397a7826aefc889ab2e7737cdfe7a7ed1d0b3d794925ef86b；SOURCE_ID見ARCHITECTURE。9個正式庫只讀檔頭均標準SQLite；main.db亦以一般SQLite mode=ro讀取catalog成功。先前REA的3.53.3只是分析工具版本。
- **L10 DB／mutation**：background module29609 [633664,649512)初始化db_<spaceId>.sqlite3及Knex pool；24047 [1414090,1431336)是部分mutation＋transaction／索引outbox／entity.updated；9174 [885979,968380)有直接讀寫、hydrate、引用及note-card-content-updated通知；79507 [1305060,1390708)KnowledgeAPI在主程序內呼叫service，不必經renderer IPC。
- **L11 附件／標籤**：background 18291 [973201,1027533)含uploadFile/copyFile、files metadata CRUD及獨立uploadFileToS3；29130 [1214454,1245520)含tagList/cardTagList/collections/views；589 [1207883,1212645)管理sections；32428 [1153400,1174271)管理Mindmap。addMindMapNode支援node＋parentChildNodeIds同一transaction，但前端路徑不一定傳入父關係，不能把所有新增鏈宣稱為一個交易。
- **L12 附件協定**：background module92586的sd()在protocol.handle("flexnote")讀files表並以fs串流，支援Range/MIME；文字位置Python code point604360。前端45828 [3429564,3432759)生成flexnote://file/<id>，二進位不是全走KD。
- **L13 Renderer邊界**：前端19311 [3428770,3429432)明確configureCanvasHost，8734704附近配置serviceHandler=58850.KD；58850 [8772095,8775325)desktop分支window.ipc.invoke。67259 [7973418,7984276)hydrate，48626 [8305630,8515142)頁容器callbacks，10764白板元件，66597 CanvasEngine。
- **L14 效能邏輯**：前端66597 calculateLOD在3547560，scale>.6/high、>.4/medium、>.15/low、其餘skeleton；3545650反轉視圖矩陣並外擴100作裁切；15166 searchInViewport在3998069；static picture cache在3537611；可見圖像載入與PDF preview取消／版本檢查亦存在。數字是原碼閾值，不是新增驗收配額或性能實測。
- **L15 原碼可重建性**：CanvasKit WASM 7,094,511 bytes、SHA 2abfa191f92f0aee6e0c8e3ff9612294a7721a40761216867c1c059e7993c9d3；glue為37757。封裝核心app source maps=0，2257份maps皆第三方；100個app TSX均icons，workspaces宣告packages/*但該tree未隨附；缺完整core source/build配置。sk-wasm-surface僅程式字串，未證實是公開套件。
- **L16 官方備份實作**：background81919 [653218,667730)，Re()枚舉表逐表select，Pe()只append工作區JSON、MainDB JSON及meta.json；ke()排除特定AI索引與shadow表；He()逐表交易合併，preferences特別處理。未見整體封存讀交易，不等於證實所有呼叫端都允許並行寫入；本案不依賴此未證實前提。
- **L17 SQLite初始化**：background26074 [207899,209584)載入sqlite-vec並設busyTimeout；不是SQLCipher key設定。實際讀普通表、正文及備份成功是未整庫加密的主要證據。
- **L18 九庫用途／journal**：私人flexnote-nine-db-inventory.json逐庫mode=ro查詢；9庫均DELETE。main.db含spaces、syncConflictArchive、knex_migrations/lock及sqlite_sequence；8個spaces ID與檔名全匹配，6個trashed。工作區migration數58／82／87不同。架構中W0–W7逐庫列出，沒有刪空庫或垃圾桶資料。
- **L19 Editor延遲／ACK**：focused-iv.js的registerUpdateListener合併約200ms；factory34883約300ms節流／pending timer。前端48626的onNodeContentChange呼叫KD(updateNoteCard)後更新UI，未向上return該Promise；28862只作歷史snapshot判斷。source receipts在flexnote-editor-persistence，不能把contentVersionSnapshot當完成寫入的鎖或ACK。
- **L20 Native完整回建**：native-backup-audit-result/report.json記engine3.44.2、9/9 source不變、snapshot→restored完整影像hash相同、schema相同、integrity=ok。以私人副本測試；未實測原版vec0查詢／重建。
- **L21 隔離原型**：snapshot-prototype.test.cjs共11項通過：DB/FTS/history/引用、no-op、flush順序、immutable asset舊版、3處發布中斷、亂序／壞檔、A/B分支、load rollback、WAL拒絕、漏asset及未知版本。timer/GUI／真實editor barrier未實作。

## REA證據ID與完整性限制

| 分析範圍 | retained parent Evidence ID |
|---|---|
| ASAR manifest／preload | ev_ce282a290e9b8effd2251ad99e7976bbed5f8e2b26a3a936bc3362d17ad4cdee |
| background靜態結果（60秒timeout保留，語義不完整） | ev_5d1f2e16e9995637b78da9404e94c0d8ee3adf725fb91917439008f984369942 |
| renderer66597/15166/60647/23 | ev_80b0a9f670c9bf9036c1114b380db842f2c8bbe57083e2d7af1cd07b979d767c |
| DB／mutation／歷史29609/24047/48156 | ev_6665bca86b821541ac10242ecaa7bb08725a52016f66b695e0ccd4f47ab31842 |
| IPC／雲傳輸9174/77691 | ev_b69ff508f117b4d83152ead10f8e9d997cfc893cc54b35d5dd255f8ceaa23c50 |
| 附件／標籤／sections18291/29130/589 | ev_677ca03c6214c56c583add32693c8eec4419d9eeafbcd61e85b107cfe59f5723 |
| host／asset URL／hydrate19311/58850/45828/67259 | ev_64687cf27ef4d2a493e769cf1ac28ea30d3aa5afd6f3dae581333bdd38a948d8 |
| Mindmap頁／adapter／layout／Undo | ev_0fdcc47fda70712b4d5c4b73c6e9b33e2639625d01ff0dd9fa918ab37d4b6a6b |
| focused鍵盤與Lexical組字gate | ev_b9e48414f559cba6978681c13a3321d05e24daeb449e8773370c3087a29df37a |
| 官方JSON備份81919（後續追加） | ev_e830fad819056a208ffedf327bfe57a42f9c2e922977674fae080cce85bcf193 |

完整bundle已匯出私人flexnote-reverse-boundaries-evidence.json；包含截至host邊界分析的20筆REA records，後續backup81919另有上表REA證據及私人AST receipt，26074及native VERSION以私人AST receipt／本輪工具結果為證，不偽稱在該REA bundle內。資料範圍選擇、外部依賴、動態通道與語義node上限造成partial coverage，不代表全產品皆完成分析。
