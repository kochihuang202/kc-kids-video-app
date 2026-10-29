# FlexNote 架構獨立審查報告 (Independent Architecture Review)

審查日期：2026-10-30  
審查人：第二架構工程師 (Gemini)  
審查對象：Git commit `01f4036` 及工作區核心文件與原型程式 (`snapshot-prototype.cjs`, `snapshot-prototype.test.cjs`, `audit-native-backup.cjs`)  
審查範疇：SQLite 備份還原架構、Lexical 編輯寫入屏障、自動快照機制、OneDrive 雙機交接與附件版本化、端到端驗收缺口

---

## 一、審查摘要與下一階段判定

### 1. 是否同意進入下一階段？
**結論：【有條件同意（Conditional Pass）】**。  
Codex 在 commit `01f4036` 的工作成果非常出色，成功證實了三項關鍵技術假設：
1. 隨附 SQLite 3.44.2 引擎之 native Backup API 能無失真複製所有包含歷史 BLOB、FTS5 及 vec0 shadow 表之真實資料庫（9/9 庫影像雜湊完全一致，無需逐列 SQL 翻譯）。
2. 基於 SHA-256 內容定址儲存（CAS）之附件共用與世代快照原型運作正常，11 項包含分支識別、故障回復與順序保護之隔離測試全數通過。
3. 放棄重建 Markdown/JSON 權威儲存，收斂至「保留原版 SQLite 核心＋外部安全世代快照」的大方向具備極高可行性與成本優勢。

**進入下一階段的前提條件（Blocking Conditions）**：  
在進行任何生產環境整合前，必須先解決下列 **P0 級別的架構盲點**（特別是實體應用鎖定下的還原失敗、main.db 目錄多庫一致性、以及活動附件路徑與 OneDrive 衝突）。

---

## 二、關鍵架構維度詳細審查

### 1. 編輯器寫入屏障（Editor Write Barrier）

#### [分析現況]
在 `ARCHITECTURE.md` 與 REA 分析中已確認：Lexical 編輯器在前端有約 200ms 的 debounce 合併，模組 34883 adapter 另有約 300ms 節流，且 48626 的 `onNodeContentChange` 調用 `KD(updateNoteCard)` 後為 fire-and-forget（未向外回傳 Promise）。  
在 `snapshot-prototype.cjs` 中，`capture()` 仰賴呼叫端傳入之 `withBarrier` 與 `flush` 回呼函式；Test 3 僅以合成 pending promise 驗證了 await 呼叫順序。

#### [架構現實與限制]
- **純外部程序（Zero-Patch）無法得知記憶體狀態**：若 FlexNote 正在執行且使用者持續打字，外部工具只能看到 SQLite 檔案狀態。在 Lexical 節流與 IPC 傳輸的 200~500ms 空窗期內，SQLite 處於完全解鎖狀態。若此時觸發 Backup API，快照取得的將是尚未寫入磁碟的舊內容。
- **不可用固定 sleep 取代屏障**：機械式等待（例如 sleep 500ms）在系統負載高、大型 PDF 處理或中文輸入法（IME）長句組字時依然會產生 race condition。

---

### 2. 自動快照（Auto Snapshot）

#### [分析現況]
使用者需求包含：Ctrl+S 手動快照、每 10 分鐘有變更才自動快照、忘記關閉程式仍能定期保存、無變更不得重複儲存。  
`snapshot-prototype.cjs` 目前在 `captureLocked` 中以 `this.api.backupFile` 備份候選 DB，計算完整 SHA-256 並與 `state.fingerprint` 比較，一致則回傳 `created: false`。

#### [架構風險]
- **I/O 效能浪費**：實際工作空間（如 W3）資料庫達 90MB。若每 10 分鐘或每次使用者按 Ctrl+S 都必須先將 90MB 複製到 staging 並做完整 SHA-256 才能判斷「是否有變更」，將對磁碟與 CPU 造成不必要的常態負載。
- **Ctrl+S 捕捉途徑**：若不修改原版程式，外部程序無法直接攔截 Electron 視窗內的內部快捷鍵事件。

---

### 3. SQLite 與完整工作區還原（SQLite & Workspace Restore）

#### [分析現況]
目前 `SnapshotPrototype` 是以**單一工作空間庫**（`db_${workspaceId}.sqlite3`）為操作單元，尚未納入 `main.db`。9 庫 native 實驗是「逐一獨立備份」，並非「多庫同一時間點一致性快照」。

#### [架構風險]
- **多資料庫傾斜（Multi-DB Skew）**：FlexNote 存在 `main.db`（catalog、空間清單、全域設定）與 `db_<spaceId>.sqlite3`。若工作區在備份期間被重命名、歸檔或建立新白板，分開備份會導致 catalog 與空間內容版本脫節。
- **Windows 檔案鎖定與還原碰撞**：`load()` 函式採 `fs.rename(this.working, rollback)`。在 Windows 環境下，若 FlexNote 程式正在執行，Node/Knex 會鎖定 SQLite 檔案控制代碼（handle），任何 `fs.rename` 會立刻拋出 `EBUSY` 或 `EPERM`，導致換盤失敗。
- **裝置專屬路徑覆蓋**：`main.db` 若無差別同步至電腦 B，電腦 A 的使用者路徑（例如 `C:\Users\ji3cp\...`）將直接覆蓋電腦 B 的設定。

---

### 4. OneDrive 與附件（OneDrive & CAS Assets）

#### [分析現況]
`snapshot-prototype.cjs` 正確實現了不可變 CAS 物件庫（`assets/xx/<sha256>.<ext>`），已能保證：
1. 未變更附件跨世代共用，不重複佔用磁碟。
2. 舊快照不受新快照覆蓋或修改影響。
3. 清冊具備 fileId、logicalPath、sha256 嚴格對應與二階段下載驗證。

#### [待解決問題]
- **活動目錄路徑環路（Path Loop）**：本機目前 `userFilePath` 本身就已經被設定在 OneDrive 同步資料夾下（`OneDrive - Foxconn\...\FlexNote`）。若外部快照交換庫亦設在 OneDrive，會形成「活動附件被 OneDrive 同步一次、快照物件又在 OneDrive 同步一次」的雙重同步與鎖定衝突。
- **Windows 佔位符（Cloud Placeholder）檢測未落地**：目前 `isLocallyAvailable` 為假回呼。在真實 Windows OneDrive Files On-Demand 環境下，未水合（hydrated）的檔案若被直接讀取串流，會導致無預警阻塞或 I/O 逾時。

---

### 5. 實際使用驗證（Real-world E2E Validation）

#### [現狀缺口]
目前的 11 項測試全數建構在 mock 資料表與合成 PNG 上。真實 FlexNote 是否能「在還原後的目錄下成功啟動原版 `FlexNote.exe`、正確解碼 CanvasKit 白板座標、正常載入 `flexnote://file/<id>` 串流」，**至今尚未執行過哪怕一次真正的端到端驗證**。

---

## 三、問題清單與分級建議 (P0 / P1 / P2)

### 【P0 級別：必須在進入下一階段前解決】

#### P0-1：運行中還原遭遇 Windows 檔案獨佔鎖定（EBUSY Crash）
- **事實證據**：`snapshot-prototype.cjs` 第 264 行 `await fs.rename(this.working, rollback)`；Windows 核心對所有被程序開啟的 SQLite 檔案施加強制鎖定。
- **架構風險**：若在 FlexNote 開啟時執行 `load()`，換盤會必然崩潰，觸發 rollback 甚至導致工作區進入孤兒目錄狀態。
- **最小修正建議**：
  1. 在 `load()` 入口加入**程序互斥前置檢查**：透過 Windows API / PowerShell 檢查 `FlexNote.exe` 是否執行中。
  2. 若執行中，**嚴格拒絕還原**，提示使用者關閉程式；不得嘗試在程序運行中進行目錄熱替換。
- **最少必要測試**：在檔案被 `fs.open` 持續持有的狀態下調用 `load()`，驗證程式能優雅報錯並保持原工作區 100% 完好無損。

#### P0-2：活動附件路徑與 OneDrive 交換庫重疊導致雙重同步與鎖死
- **事實證據**：`FEATURE_MATRIX.md` 紀錄本機 `userFilePath` 為 `C:\Users\ji3cp\OneDrive - Foxconn\...`；而交換根目錄又預計指向 OneDrive。
- **架構風險**：FlexNote 運行時會頻繁讀寫 `files/`，此時 OneDrive 背景同步軟體會與 FlexNote 競爭檔案 handle，導致快照時的 `copyFile` 遭遇鎖定失敗；且附件上傳流量與容量直接翻倍。
- **最小修正建議**：
  - 架構規範切分：**工作目錄（Active Working Directory）嚴禁設在 OneDrive 內**，應位於本機非同步區域（如 `%APPDATA%\flexnote`）；**只有外部快照庫（Exchange Root）允許指向 OneDrive**。
- **最少必要測試**：設定驗證路徑檢查斷言，當發現 `working` 位於 OneDrive 目錄內時主動發出架構警告。

#### P0-3：缺少全域目錄 `main.db` 與空間庫的聯合交接邊界
- **事實證據**：`snapshot-prototype.cjs` 僅處理 `db_${workspaceId}.sqlite3`，`load()` 完成後不更新 `main.db` 的空間註冊表。
- **架構風險**：若在電腦 B 上接收新快照，但電腦 B 的 `main.db` 尚未登記該工作空間或 catalog 資訊過舊，開啟 FlexNote 後將完全看不到該空間。
- **最小修正建議**：
  - 快照 Manifest 擴充 `catalog` 節點：記錄該 `workspaceId` 在 `main.db` 中對應的空間名稱、圖示及中繼資料。
  - 還原時，若電腦 B 的 `main.db` 缺乏該空間，外部工具以最小 Knex/SQLite 操作將該空間註冊記錄補入電腦 B 的 `spaces` 表，而不覆蓋電腦 B 原有的其他空間與本機偏好。
- **最少必要測試**：在空 `main.db` 環境下執行還原，驗證原版程式開啟後能正確於側邊欄列出該工作區。

---

### 【P1 級別：必須在正式上線導入前解決】

#### P1-1：常態自動快照採用全庫備份導致過度 I/O
- **事實證據**：`snapshot-prototype.cjs` 第 128 行，每次 capture 都先跑整庫 `backupFile`（90MB）以計算 SHA-256。
- **架構風險**：每 10 分鐘或頻繁觸發時，磁碟頻繁寫入 90MB+ 暫存檔，加速 SSD 耗損並佔用 CPU。
- **最小修正建議**：
  - 引入輕量 dirty 檢查：在快照前，先以唯讀方式連接活動庫，執行：
    ```sql
    PRAGMA data_version;
    ```
  - SQLite 的 `data_version` 在庫內任何交易提交時會自增。若 `data_version` 與上次快照記錄相同，耗時 < 0.5ms 即可判定「無資料變更」，直接跳過備份與雜湊計算。
- **最少必要測試**：連續呼叫兩次 capture，在無 SQL UPDATE 的情況下，驗證完全不觸發 `backupFile` I/O。

#### P1-2：Windows OneDrive 佔位符未水合偵測
- **事實證據**：`isLocallyAvailable` 仍為 mock 函式；Windows NTFS 的雲端檔案具備 `FILE_ATTRIBUTE_REPARSE_POINT` (0x400) 或 `FILE_ATTRIBUTE_OFFLINE` (0x1000) 屬性。
- **架構風險**：當電腦 B 收到新快照但 OneDrive 尚未完全將大 PDF/圖片下載至磁碟時，直接以 Node.js `fs.createReadStream` 讀取會引發同步阻塞或錯誤。
- **最小修正建議**：
  - 在 Windows 下呼叫 `fs.stat` 檢查檔案屬性（或透過輕量 PowerShell/Node addon 讀取 `dwFileAttributes`），若具備離線佔位標記，直接歸類為 `PENDING`，拒絕執行還原切換。
- **最少必要測試**：建立具備模擬離線屬性的檔案，驗證 `scan()` 能精確判定為 `incomplete` 並阻止 `load()`。

#### P1-3：運行中寫入屏障與儲存觸發之最小侵入實現
- **事實證據**：原版 Lexical 內部存在 200ms/300ms 延遲，外部程序無法感知記憶體隊列。
- **架構風險**：使用者在打字過程中若自動快照觸發，可能擷取到半截內容。
- **最小修正建議**：
  - **模式分流**：
    1. **無侵入模式（純外部，優先）**：自動快照不抓「打字瞬間」，而是監聽 SQLite 檔案的存取靜止期（Debounce Quiet Period）。當偵測到 `data_version` 改變，且其後連續 3 秒無新寫入，才執行 snapshot capture。
    2. **使用者退出時**：原版正常退出必定會 flush 內部佇列；在退出後執行最終快照，此時資料具備絕對一致性。
- **最少必要測試**：模擬在頻繁寫入後停止 3 秒，驗證快照抓取的資料庫包含最後一筆提交。

---

### 【P2 級別：架構優化與後續維護項】

#### P2-1：未引用的孤兒附件（Orphan Assets）垃圾回收
- **事實證據**：`snapshot-prototype.cjs` 明確規範第一階段不做 GC，只增不減。
- **架構風險**：長期使用後，白板中刪除的暫存圖片與歷史 PDF 會永久留在 `exchangeRoot/assets/`，佔用 OneDrive 雲端空間。
- **最小修正建議**：在 M3/M4 階段新增獨立指令 `vacuum-assets`，比對所有現存快照 manifest，將無任何快照引用的 hash 物件移至封存區。
- **測試**：驗證刪除分支後，被孤立的 asset 能被正確識別。

#### P2-2：Markdown / 語義 JSON 匯出工具實作
- **事實證據**：目前焦點全在 SQLite 二進位快照，尚未實現人可閱讀之資料匯出器。
- **架構風險**：若使用者面臨災難性恢復且不想安裝 FlexNote 時，資料自主性稍顯不足。
- **最小修正建議**：維持原計畫作為 M2 交付項，不阻礙當前快照同步主線。

---

## 四、最少關鍵測試缺口（以原版程式開啟為核心）

目前的 11 項測試證明了「外部工具邏輯自洽」，但**未證明原版 FlexNote 相容性**。下一步必須執行的**最少三項關鍵驗證**為：

```mermaid
flowchart LR
    Step1["1. 真實庫快照製作<br/>(含 724 筆附件與歷史)"] --> Step2["2. 隔離乾淨目錄還原<br/>(非正式 Roaming)"]
    Step2 --> Step3["3. 原版 FlexNote.exe 啟動<br/>(--user-data-dir 導向)"]
    Step3 --> Step4["4. 人工白板巡檢<br/>(雙板共享卡/連線/圖片串流)"]
```

1. **真實資料庫與附件完整快照實測**：
   - 脫離合成資料，使用目前包含 89MB 主庫、724 筆真實附件的私人備份執行一次完整 `capture()`，記錄產生世代的耗時、雜湊計算時間與清冊正確性。
2. **乾淨沙箱目錄還原驗證**：
   - 使用 `load()` 將上述快照釋放至一個全空的測試目錄（如 `D:\flexnote-test-sandbox`）。
3. **原版 `FlexNote.exe` 沙箱掛載驗證**：
   - 啟動原版程式並指向該測試目錄，人工或自動確認：
     - [ ] 白板 23 張跨板共享卡片是否正常顯示、雙向關聯是否維持。
     - [ ] 圖片是否正常透過 `flexnote://file/<id>` 串流顯示，無破圖。
     - [ ] 搜尋欄輸入關鍵字能否命中 FTS 表內容。
     - [ ] 歷史版本面板能否讀取先前的 374 筆編輯歷史。

---

## 五、審查結論與下一步行動建議

1. **架構方向正確**：保留 SQLite 核心與原版 CanvasKit 渲染層，搭配外部 CAS 不可變快照，是目前兼顧**開發成本、日常效能、歷史版本完整性與授權合規**的最佳工程解。
2. **前三大致命風險**：
   - **Risk 1**：運行中還原遭遇 Windows 檔案獨佔鎖定（EBUSY），缺乏程式運作狀態互斥防護。
   - **Risk 2**：活動資料庫/附件路徑與 OneDrive 交換庫重合，引發檔案競爭與雙重同步災難。
   - **Risk 3**：多庫（`main.db` 與 `db_<spaceId>`）缺乏聯合註冊機制，導致還原後工作空間無法被原版識別。
3. **建議 Codex 下一步動作**：
   - **優先執行 M1 原版重開驗收**：撰寫一個最小端到端驗證腳本，以隔離參數啟動原版 `FlexNote.exe` 掛載由 `snapshot-prototype` 還原的目錄，確認核心白板與附件可正常運作。
   - **修正 `load()` 互斥邏輯**：增加「檢測到 FlexNote 運行中即拒絕還原」的防呆保護。
   - **將活動目錄移出 OneDrive**：在設定指南中明確規範活動庫與快照交換庫的實體路徑分離。
