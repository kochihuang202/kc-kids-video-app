# 無感接力與增量更新（0.5.0）

## 日常操作

兩台首次換用包含更新器的 0.5.0 可攜版，設定各自的 OneDrive 本機交換路徑。若原本是兩個不同工作區，首次會列出時間、電腦名稱、白板與卡片數，選定同一共用工作區；原資料先保存，不自動合併。開發 Git 工作目錄不接受更新器覆寫。

完成配對後，啟動先檢查版本才開放編輯；恢復前景、休眠恢復、檔案變動與每 30 秒也會檢查。無衝突且新版完整，就在原 BrowserWindow 更新內容、保留視角與額外視窗。雙邊修改才要求選版本；選定後記住已處理的舊分支，新分支仍會重新提醒。啟動缺檔時等待，可選擇使用本機版；檔案到齊會自動重試。無關工作區及沒有 Manifest 的舊中斷目錄不阻擋目前工作區。

Ctrl+S、保存、每 10 分鐘、正常關閉與切到背景會走同一保存邊界。右上通知等 SQLite ACK/快照驗證完成才成功；成功三秒消失，等待/失敗保留。OneDrive 本機寫入不等於雲端上傳，仍由使用者確認傳輸完成。

設定可為這台電腦命名（例如公司、家裡）。保存時間以台灣時間顯示，UUID 收在詳細資訊；底部本機/快照版本仍可對照。

## 同步邊界

- 單一 operation queue 序列化保存、配對、資料切換、程式更新。沿用真實 Lexical flush/IME barrier/附件 pending 操作與 SQLite COMMIT ACK，不用固定延遲推定已保存。
- 本機 Outbox 先產生 UUID 快照並 fsync、再記錄基準；OneDrive 不可用時保留待送內容。重試同一 UUID、依父版本順序送出，驗證成功才寫 published receipt。已發布與待送的本機備份暫不自動清除。
- 穩定 workspaceId 記錄基準；保留舊 root|workspaceId 索引相容既有狀態。改程式目錄或同步路徑不產生新的工作區身分。
- 自動判斷只讀 Manifest/版本圖及 Worker summary，不逐一雜湊歷史 DB/附件。候選版本仍做完整 DB/附件/外鍵/路徑驗證後才能載入；手動完整掃描仍可用。
- 本機已提交但未發布、或 flush 後出現新編輯，都視為本機修改而暫停自動覆蓋。選本機或遠端會保留另一分支，不自動合併。
- 暫停所有 renderer、完成 flush、再核對版本；切換 DB 時關閉舊 Worker，使用同一外部 facade 換成新連線。每個 preload 固定綁定 workspace epoch，過期 IPC 與橋接回應不得寫入新工作區。
- 同一 BrowserWindow 重建 renderer，等全部視窗 ready ACK 才回報成功；失敗回復本機原 DB/基準，再於原視窗恢復。被刪除的已開卡片/白板顯示移除狀態，不復活內容。CAS 採補齊而非搬走舊 files/。
- 平移、縮放、目前白板在本機 device-state；預設收藏組只在真的新增收藏時入庫，單純讀取、純時間戳及相同內容不製造假變更。新空白安裝不再插入示範筆記。

## 程式更新

- 更新包在交換根目錄使用唯一 `InkBridge-update-UUID.zip` 與對應描述檔；不增加資料快照的 latest 檔案。
- 發布工具比較完整 portable Manifest，只包新增/變更檔案並列明刪除；來源/目標 buildId、releaseSequence、SHA256、Win x64 與 Schema 1 綁定。
- RSA-3072/SHA256 簽章，Node 與 Windows PowerShell 皆驗證。私鑰留在忽略的 private-publisher/key.pem，僅公鑰進程式/Git。簽章模式依 Node crypto 與 .NET RSA 官方 API；不是自行實作密碼學。
- 啟動/前景檢查更新；按「更新並重新啟動」先將 ZIP 複製到本機 Updater/UUID 並驗證、解開。拒絕越界、重複、裝置路徑、reparse/symlink、雜湊及基底不符，程式與資料/交換根目錄也不能交疊。
- 保存並暫停視窗後啟動外部 PowerShell helper，再退出本身。helper 等舊程序退出，按 journal 備份/替換/刪除指定檔案；新版 native renderer ready 與 DB 開啟後寫 health ACK，才標為完成。失敗則回復程式，重新開啟舊版。第一版不進行資料庫 Schema 遷移。
- 穩定的 .bat/Recover-InkBridge.ps1 在下次啟動回復未完成的更新 journal；正常更新啟動以 job 環境旗標避免自我回復。Windows PowerShell helper 明確使用 UTF-8、清理繼承的 PSModulePath 並關閉 stdin，避免從 PowerShell 7/開發環境啟動時模組載入停滯。

## 發布指令

`node scripts/original-reuse/prepare-publisher.cjs` 僅首次或核對發布公鑰使用，不會輸出私鑰。

完整可攜版：設定 `INKBRIDGE_RELEASE_SEQUENCE`（高於上一發布版本），執行 `node scripts/original-reuse/build-portable.cjs`。

增量包：`node scripts/original-reuse/publish-update.cjs <來源可攜資料夾> <目標可攜資料夾> <輸出交換目錄> <目標發布序號>`。序號須與目標 Manifest 相同且高於來源。中間增量缺失時等待對應包，不依檔案時間強行套用；Electron 更新可使包變大，但仍按實際檔案差異產生。

## 驗證狀態

已執行：check-seamless-sync（啟動/運行中自動更新、同一 HWND、多視窗、觀看位置、真衝突）；check-sync-entry（缺檔到齊自動進入、一次配對、舊工作區保存）；sync-outbox、program-updates、persistence、note-version、workspace-snapshots、original-bookmarks 定向測試；既有 check-standalone-windows、check-board-windows、check-native-bookmarks 回歸。

收藏測試明確新增 fixture 卡片，不再依賴啟動自動插入示範卡片。舊 check-startup-snapshots/check-storage-settings 的每次手選/關閉程序規格由本次使用者指令取代，無感流程由新增測試維護；不把舊行為失敗偽稱回歸通過。

尚需完成發布驗收：實際可攜版由畫面按更新、重啟與 health ACK；最後 ZIP/簽章檔/說明複製至 OneDrive 後的雜湊核對。

尚未宣稱：兩台實體電腦的實際網路傳輸、斷電硬體故障、大型工作區效能與所有原版功能全回歸。本次不刪除正式資料，也未自動替正式工作區做配對。

參考：[Node crypto](https://nodejs.org/api/crypto.html)、[.NET RSA VerifyData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rsa.verifydata?view=netframework-4.8.1)。
