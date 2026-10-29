# FlexNote M0/M1 功能與證據矩陣

評估日期：2026-10-30。範圍：產品研究、唯讀本機調查、隔離資料轉換；沒有修改原版程式或正式筆記。

證據標記：**L**＝本機檔案／資料或實際測試確認；**O**＝官方文件確認；**I**＝依證據推論；**U**＝尚未確認。L 的靜態資料證據不等於 UI 執行驗證。

## 功能

| 功能 | 官方設計／本機證據 | 改造狀態與驗收 |
|---|---|---|
| 筆記卡片、富文本 | O：區塊式正文與嵌入；L：noteCards，前三筆正文 JSON 根鍵為 root | 資料列往返通過；Markdown 投影、原版重新開啟未驗證 |
| 白板與跨板引用 | O：內容與實例分離；L：noteCards / noteCardInstances；主要庫有 23 張卡片出現在多塊白板 | 實例 ID、objectId、whiteboardId、座標等欄位逐值往返；互動未驗證 |
| 白板嵌套、分區、連線 | L：whiteBoardList、whiteboardInstances、sections、connections | 資料往返通過；端點語義、Undo、拖曳未驗證 |
| Mindmap | O：白板 Mindmap 與 Markmap 流程不同；L：mindMaps、mindMapInstances、mindMapNodes，含 childNodeIds / objectId / 折疊狀態 | 資料往返通過；Tab / Enter / 中文 IME、Xmind 實測留至 M5 |
| 標籤、資料庫、屬性 | O：多視圖、篩選排序；L：tagList、cardTagList、collections、collectionViews、properties、關聯表 | 資料往返通過；視圖查詢與排序語義未驗證 |
| PDF、高亮 | O：PDF 與頁面位置引用；L：pdfCards、noteHighlights、highlights 等 schema | 有值表逐值往返；零列不算功能驗收；PDF 檔案與定位未實測 |
| 圖片、影音、影片高亮、附件 | O：來源定位及獨立檔案；L：files、mediaCards、mediaCardInstances、videoHighlights 等 | 只驗證資料列；原始二進位檔案讀取、雲端佔位檔與解碼未驗證 |
| 網頁卡、便簽、文字、形狀 | O：各為白板元素；L：textElements 等；本原型 allowlist 未覆蓋所有類型 | 非完整遷移；須補完整物件清冊 |
| 雙向連結、塊嵌入 | O：提及、嵌入、塊連結語義不同 | 保留原始正文，未解讀及重建反向索引 |
| 搜尋、AI | O：本機知識檢索；L：vec_chunks 虛擬表及 shadow tables | vec0 未載入；索引未遷移；AI 模型／會員依賴未驗證 |
| 日記、待辦 | O：官方提供；本機 quickNotes 等 schema 不足以推定日記實作 | 待辦／日記 UI 與 schema 完整映射未驗證 |
| 歷史、備份 | O：ZIP 備份與合併恢復；L：whiteboardContentVersions，有二進位 payload | payload 原位元組往返；歷史布局不含正文（遷移檔註解），不是完整筆記備份 |
| 雲同步 | O：OneDrive API、S3、WebDAV、百度；本機含同步設定鍵 | 未調用、未變更；原傳輸／合併機制未分析 |
| MCP | O：讀寫工具與唯讀設定；L：有官方 stdio bridge、設定 enabled=false，39125 TCP 不通 | 連線嘗試失敗；未 initialize、未 tools/list、未呼叫筆記工具 |

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
- [服務條款](https://myflexnote.com/terms)，2026-09-23 生效，§6 使用者內容權利、§8 同步、§9 逆向限制與法律例外。未取得可修改、重用或散布專有核心的額外授權；本次未解包、反編譯或 patch 核心。
