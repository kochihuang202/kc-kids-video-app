# M0/M1 驗證報告

日期：2026-10-30。所有結果限定於下列已執行範圍。

## 已執行

| 驗證 | 結果 | 限制 |
|---|---|---|
| 開始前 git pull | codex/phase-1b 已與 origin 同步 | 保留其他專案未提交變更 |
| docs/REGRESSIONS.md 相關搜尋 | flexnote / whiteboard / mindmap 無命中 | 沒有修改既有產品程式；未跑無關全站 Playwright |
| 本機版本／檔案配置 | 1.1.65、Electron 封裝、8 空間庫、main.db、獨立 files/backup 路徑 | 未推定精確 Electron/renderer 框架 |
| MCP 連線檢查 | enabled=false；127.0.0.1:39125 TCP 連線失敗 | 未更改開關、未認證、未 tools/list、未建立正式測試內容 |
| REA session | rea-agents 6.5.0，Windows x64，SQLite 工具可執行 | Ghidra 未設定，macOS 工具不可用；未反編譯原版核心 |
| REA SQLite inventory | 一個隔離快照取得 88 個 table inventory | 含虛擬／可能 shadow 表；不是全庫語義分析；證據 ID 見 FEATURE_MATRIX |
| 真實資料 JSON 往返 | 8 個庫，268 次 allowlist 表比較，共 10,362 列全欄位 multiset 一致；來源 snapshot 與回建庫 integrity_check 均 ok | 不含附件二進位、所有資料表、所有索引／trigger、原版 UI；不是完整遷移驗收 |
| 人工合成自動化整合測試 | `python -m unittest discover -s flexnote-assessment -p test_probe.py -v`：1 個整合測試通過 | 驗證 Unicode、富文本字串、BLOB、64-bit integer、共享卡片跨板、來源 SHA 不變、users 不輸出 JSON、拒絕覆寫既有輸出；不替代產品 E2E |

第一輪 probe 在遇到 vec0 虛擬表的 PRAGMA 時失敗；修正為明確略過虛擬表，不載入未知擴充。第二輪全部上述 allowlist 表通過。失敗輸出仍在私人目錄保留，不拿它作有效完整輸出。初次 REA 呼叫以 row_limit=0 被 schema 拒絕，改用不帶 table 的 inventory 請求，沒有藉此讀私人內容。

主資料庫的非零覆蓋：1,955 筆正文、994 卡片實例、352 連線、185 Mindmap 節點、724 檔案 metadata、37 白板、40 白板實例、41 歷史布局等。觀察到 23 張卡片跨多塊白板。逐列不變保障本次已選欄位及引用值保留，但沒有判定來源的引用圖本來是否全部有效。

## 私人資料與可重現性

原型：`probe_data.py`。輸入必須是資料庫所在目錄，輸出必須是全新私人目錄；勿指定 repository，快照可能含私人內容及帳號表。其 JSON 僅輸出 allowlist，完整 SQLite snapshot 仍屬敏感資料。不要把快照、JSON、回建庫或完整設定上傳 Git。

本次私人位置：`C:\Users\ji3cp\.codex\visualizations\2026\10\29\01a1886a-23bf-75e2-85c6-b497ce388c5e\flexnote-private-probe-v2`。summary.json 有各表列數、schema 與快照 SHA-256。使用 SQLite online backup 取得每庫一致快照；不是從運作中的 DB/WAL 直接檔案複製，也不宣稱多庫與附件原子快照。

## 尚未執行，不能算通過

官方 FlexNote 對新格式重新開啟；全類型富文本／塊嵌入／雙向連結語義；附件完整下載及 hash；PDF 頁定位；原版 Undo/Redo；MCP 工具契約；白板渲染 profiling；100/300/500 卡片基準；真實 OneDrive 雙機、崩潰與分支衝突；本機 Xmind 選取／編輯／IME 對照。

## 白板性能驗收提案（事前鎖定後才測）

使用同一 Windows 硬體、顯示器解析度／縮放、電源模式、FlexNote 版本、資料與自動化腳本；記錄 CPU、RAM、GPU、驅動、螢幕更新率。100/300/500 卡片各含正文、圖片、PDF、影音來源、Mindmap 與連線，固定數量比例及實際檔案 hash。原版與候選交錯執行，區分冷／暖讀取、附件已下載／placeholder。

量測開板至可互動及穩定幀的時間、拖曳／選取／建立／刪除的輸入至呈現延遲、平移／縮放幀時間 p50/p95/p99 與超出刷新預算比例、程序樹 private bytes／working set 峰值、重複開關後的記憶體趨勢。外部輸入及畫面量測用相同方法，不把未取得內部 performance marks 的估算標成精確 renderer CPU。

**候選門檻，需架構確認時鎖定**：熱身後每案例 10 次，冷啟動 5 次，原版和候選相同樣本；載入／互動 p95 不高於基準 110%，峰值記憶體不高於 115%；60 分鐘重複操作末段不得持續成長，回收後記憶體不高於原版相同場景 115%。這些是本評估提出的驗收值，尚未測量，應先確認量測噪音可分辨差異；未得到結果前不得宣稱達標。硬門檻另為無資料遺失、無引用錯接、無 crash。

## 最小風險導向測試集

| 層 | 核心案例 | 何時必跑 |
|---|---|---|
| 單元 | ID 穩定、富文本未知欄位、Markdown 投影、路徑映射、Mindmap 結構與組字狀態機 | 對應模型／解析器變更 |
| 整合 | 跨板共享、附件 hash、索引刪除重建、版本回復、Undo 交易、保存每階段中斷恢復 | 儲存／命令／索引變更 |
| 少量 UI | 混合白板重開、跨板編輯反映、PDF 定位、連續鍵盤建節點 | UI seam／載入契約變更 |
| 同步 | manifest 先到、物件未到、placeholder、斷網、兩機同 parent 分支、損壞檔 | 同步協定變更；發布前真實雙機 |
| 性能 | 100/300/500，固定平移縮放及混合媒體，長時間循環 | renderer／read model／載入／快取變更 |

模擬測試只驗證狀態轉移；真實 OneDrive 到達順序、衝突副本、佔位檔及 Windows 檔案占用必須在真實環境補驗。沒有第二台裝置的結果就標未驗，不以本機複製資料夾代替。
