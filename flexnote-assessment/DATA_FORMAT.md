# 明碼格式與遷移規則（提案，尚未定版）

## 本次已驗證的最小格式

`probe_data.py` 對 allowlist 表輸出 UTF-8 JSON：table、原表 ddl、columns、rows。每一 cell 都帶型別 tag，BLOB 用 base64；保留 NULL、64-bit integer、字串及原始富文本 JSON 字串，不把正文硬轉 Markdown。重新讀取 JSON 後，在隔離 SQLite 建原表、插入並用含重複列計數的全列比較驗證。這是資料列 losslessness，不是正式檔案儲存引擎或完整備份。

本次 8 庫、268 次表比較、10,362 列通過，含主要庫的 1,955 noteCards、994 noteCardInstances、352 connections、185 mindMapNodes、724 files metadata、41 whiteboardContentVersions。未遷移所有表、schema index/trigger、全域 main.db、附件二進位；空表的通過只證明格式處理。vec0 虛擬索引沒有載入。

## 正式格式候選

```text
vault.json                         # formatVersion、vaultId
objects/<cardId>.json               # 正文完整區塊樹、類型、屬性、擴充欄位
notes/<cardId>.md                   # 可編輯 Markdown 投影，先保證可還原再升為權威
boards/<boardId>.json               # instance、座標、連線、視角、容器
mindmaps/<mapId>.json               # 節點 ID、child IDs、卡片引用、布局屬性
relations/*.json                    # 標籤、屬性 schema/值、塊關聯、收藏及其他重要結構
assets/<assetId>/<original-file>     # 原始 PDF、圖像、影音；manifest 記 SHA-256
revisions/<revisionId>/...          # 不可變交易物件
commits/<revisionId>.json           # parent、deviceId、完整清冊與雜湊
```

這是邏輯提案，不是從原版逆向得到的官方 schema。objects 與 Markdown 不可同時各自當權威：未能表示的格式以完整 JSON 為權威；外部 Markdown 修改須有明確 import 規則與衝突檢查。任何未知欄位保留在 versioned extensions，不能默默刪除。BLOB 歷史需解碼成開放 JSON 才算符合最終 P1；目前 base64 僅保障原始位元組，沒有達成可理解的歷史格式。

## 完整性規則

- 保留卡片、instance、board、mindmap、node、asset、block ID；跨板只引用同一 cardId，不複製內容。
- 校驗每個引用目標，缺失項保留為明確 dangling reference，與來源庫既有缺失分開，不能擅自丟棄或生成假目標。
- PDF 頁碼、矩形／座標系、來源文件版本；影音時間、截幀來源；塊引用與嵌入須保留種類，不能只抽文字。
- 圖像、PDF、影音保留原檔，大小／hash 驗證；useLink、rawPath、remotePath 要分類，本機外鏈與遠端媒體不能宣稱已離線收齊。
- 使用穩定 ID 建檔名；處理 Windows 保留字、大小寫碰撞、Unicode、長路徑、非法字元。rename 只改 displayName；內容重名不碰 ID。
- formatVersion 升級採讀舊寫新、升級前 checkpoint、可逆回復；未知新版先唯讀，不自動降版。

## 存檔及 OneDrive 一致性（I：待實作設計）

單檔寫 tmp、flush、同磁碟 atomic replace 只能處理本機單檔替換，不能當跨機交易。每次多物件變更寫入不可變 revision，清冊列出全部內容 hash，最後發布獨立 commit。讀端只接納父版本已知、所有檔案下載且 hash 通過的 commit；到達順序錯亂時顯示等待，沿用最後完整版本。HEAD 只當提示，不能是唯一提交證據。

每個裝置的本機鎖只能擋同機多程序，不能可靠阻止離線雙機。離線兩機基於相同 parent 寫入會形成分支；保留兩個 commit 及全部檔案，標記衝突、停止自動覆蓋，讓使用者選擇或合併。不能拿檔案時間當勝負。單寫模式需要 A 關閉／存檔並確認同步後才到 B；同步完成提示必須有真實 OneDrive 狀態及接收端驗證，單靠本機檔案存在不足。

遇 Files On-Demand placeholder，先完整取得必要檔案，再驗證；未下載不能當空檔或刪除。索引／縮圖／WAL 放 `%LOCALAPPDATA%` 的裝置私有目錄，不進 vault。檔案監聽去抖與批次提交，UI 不逐張等待磁碟；讀取按 board manifest 預取，快取失效按 ID/revision，避免開板掃整個 vault。

Undo/Redo 由命令交易記錄處理；外部改動形成新版本而非偷偷接入舊 undo stack。崩潰時捨棄未提交暫存，啟動重驗 commit；hash 不符先隔離保留，再用前版復原。先建立完整有效備份，再做不可達 revision 的清理，不能立即刪除可能尚未傳完的檔案。

OneDrive 不作備份：另建獨立、版本化、含 manifest/hash 的備份目的地，定期還原到空資料夾驗證；不可只依賴官方白板布局歷史或 OneDrive 垃圾桶。

## 遷移驗收順序

來源唯讀備份 → schema/類型清冊 → 完整 ID／引用／附件圖 → 明碼輸出 → 重建本機索引 → 全圖語義與 hash 比對 → 隔離原版或新 adapter 開啟 → 真實 UI 與重開 → 版本還原。來源不覆蓋，失敗保留證據並可回到原庫。完成這條路徑前，不把新格式設定成正式資料來源。
