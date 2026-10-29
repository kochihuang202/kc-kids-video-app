# Gemini第二階段審查：逐項處置與最小整合方案

日期：2026-10-30。審查基線：commit 01f4036；GEMINI_REVIEW.md原文保留，不視為執行指令。本輪重新跑既有11項測試、增加私人合成實驗，並讀既有逆向證據的小段函式；沒有重新執行完整REA、啟動正式FlexNote、修改原版／正式設定／資料，亦未修改snapshot-prototype.cjs。

## 判定摘要

**資料層原型可繼續研究；原版運行中可靠flush／Ctrl+S／10分鐘快照的整合目前仍未成立。** 純外部工具可觸發計時、觀察按鍵與備份已提交SQLite，但目前未找到已驗證、可等待全域editor與交易完成的原版API。不能把三秒靜止、data_version、UI失焦或程序退出當作該ACK。

P0-1～3阻止正式載入／正式部署，不必阻止不接觸正式資料的flush能力調查。下一階段應先證明隔離啟動及真實editor ACK，不先寫完整同步器或先替換資料庫。

## 逐項處置

| 項目 | 主分類 | 證據與處置 |
|---|---|---|
| P0-1 運行中還原／Windows鎖 | **確認存在，需要修正：缺正式整合前置條件**；已有部分失敗處理 | prototype:94的closeWorking預設no-op，259僅await callback，無法證明真實pool／worker已關閉。但264～277已有try/catch、movedOld/movedNew與rollback；本輪實際禁止delete-sharing的handle使load以EPERM拒絕，原working存在、DB hash／內容不變。故不接受「必然崩潰／必然孤兒」描述。正式restore應取得目標工作區quiesce＋close ACK並驗證owner/lease，做不到就拒絕；不以所有FlexNote.exe均未執行作唯一判準。 |
| P0-2 活動附件與OneDrive | **確認存在，需要修正：拓樸與路徑驗證缺口**；鎖死／翻倍幅度尚未驗證 | 實際userFilePath在OneDrive；prototype:85～86已有localRoot/exchangeRoot相同或嵌套拒絕，但不拒絕兩個同在OneDrive的兄弟目錄，也未處理大小寫、junction/realpath、真正活動附件root。正式工作副本應在非同步區，交換區獨立；先盤點及測試遷移，不移動現用資料。「遞迴環路」須有嵌套／遍歷證據，目前只證實雙重同步風險，不能宣稱鎖死或容量／流量必翻倍。 |
| P0-3 main.db/catalog | **確認存在，需要修正** | capture/load目前只管一個工作DB；9庫實驗是逐庫副本。main.db的spaces.id與db檔名、syncConflictArchive.spaceId有邏輯相依，需同一capture邊界擷取選定workspace metadata，並在關閉／隔離狀態套用該筆catalog及必要歸檔，保留其他空間。實際spaces schema沒有Gemini提到的icon或裝置絕對路徑欄位；userFilePath／token在另外的設定JSON，不能把覆路徑原因錯指main.db。仍不可整個profile或main.db直接蓋到B。 |
| P1-1 全庫no-op判斷I/O | **確認存在，需要修正；data_version建議不可原樣採用** | prototype:123～166先做DB副本及全部asset hash，再判斷fingerprint；沒有新snapshot不代表沒有I/O，而且no-op候選staging尚未清理。現有測試只保證不發布重複版本。data_version只能在同一持續連線上比較其他連線的commit，無法比較每次新連線，也看不到未flush editor與asset-only變更；固定<0.5ms沒有量測依據。正式用可信的userDataRevision＋assetRevision＋ACK作快速判斷，data_version最多作輔助hint，仍需處理連線重建／DB替換的epoch。 |
| P1-2 未水合檔案 | **確認存在，需要修正**；清冊／hash已有機制 | prototype:96 availability預設true，186才詢問hook；11項測試對missing/hash與注入PENDING已有保護，未接真實Windows雲端屬性。不能把所有REPARSE_POINT判為未下載，它也代表symlink/junction等；Node Stats不直接提供完整dwFileAttributes。需用正確Windows屬性／Cloud Files資訊分類offline/recall/partial，先不讀payload；最後仍驗bytes/hash。不得以模擬offline屬性取代真實OneDrive驗收。 |
| P1-3 寫入屏障／觸發 | **確認存在，需要修正；提升為下一階段P0 gate** | prototype:92～95四個關鍵hook可默認no-op，11項合成測試不能證明原版已flush。實際adapter有本地flush、blur/unmount保存嘗試，但上游Lexical合併與下游fire-and-forget仍缺全鏈ACK。拒絕用三秒quiet期作成功條件；正常退出是否等待全部交易也未證實，不能稱絕對一致。Ctrl+S可由OS層觀察／攔截，Gemini說外部完全不能捕捉太絕對；真正缺的是應用語義及寫入完成確認。 |
| P2-1 孤兒asset GC | **可以延後處理** | CAS不可變、分支保留及首版不GC已實作／測試，符合使用者安全優先指示。日後先計所有保留版本／分支／祖先／未完成發布／載入中引用，再隔離候選；不能只按年齡或「最新版本未引用」刪除。這不是本階段阻塞。 |
| P2-2 Markdown／語義JSON | **可以延後本輪實作；保留既有交付要求** | 完整exporter確未完成，但標準SQLite可讀＋原檔＋原生快照已提供資料取回基礎，不等於完全鎖死。此項不阻擋flush PoC；之後仍須驗完整語義與還原，不因本輪延後而取消。 |
| 原版重開E2E | **尚未驗證的風險；正式相容性gate** | 同意未啟動原版驗收，11項並非原版相容性證明。不接受直接在同一正式Windows帳號只加--user-data-dir便視為沙箱：程式含requestSingleInstanceLock、second-instance及setAsDefaultProtocolClient，亦有獨立的附件設定、partition、更新／外部路徑。先證明完整隔離，再啟動。 |

## 已有機制：不能當不存在，也不能擴大其保證

- UUID目錄、sourceComputerId／parent、非共享本機state、parent graph：已處理同parent A/B分支與遲到版本；不依mtime挑勝者。
- COPYFILE_EXCL、hash/size、DB files清冊交叉驗證：已處理新舊asset共用、舊版引用、缺檔、壞hash及漏引用。
- closeWorking/reopenWorking是已有整合介面，非真實close證據；try/catch rollback確實存在，但不等於涵蓋斷電或所有活躍pool。
- 版本／schema檢查、WAL online拒絕、孤立測試標記均已存在；不能把刪掉這些檢查當成「更容易整合」。

## 本輪新實驗

執行review-probes.cjs，使用相同隨附SQLite3.44.2，僅操作新建的私人目錄。摘要：

| 實驗 | 實際結果 | 意義 |
|---|---|---|
| writer自己commit | data_version 1→1 | 不是每次commit都自增 |
| 持續observer看到別人commit | 1→2 | 可作持續觀察hint |
| 每次新開reader | commit前1、後仍1 | Gemini建議的重新連線比較可漏變更 |
| 只有asset變更 | observer值不變 | DB detector不足以判整個工作區dirty |
| 記憶體pending狀態 | DB與版本指示看不到 | 合成反例，不是假裝實測原版editor |
| 一般Node fs.open持有 | rename成功 | 「任意open handle必定阻止rename」不成立 |
| 不允許delete-sharing的FileStream | load回EPERM、來源DB hash及內容不變 | Windows風險真實，但現有例外保護不是空白 |

私人原始report：C:\Users\ji3cp\.codex\visualizations\2026\10\29\01a1886a-23bf-75e2-85c6-b497ce388c5e\gemini-review-probes\review-89BF8Z\report.json。

既有Node suite本輪重跑11/11通過，約2.82秒，僅是合成資料結果。9庫native備份實驗程式未修改，沿用01f4036已記錄結果，未重複拷正式庫或重做完整REA。

## 整合可行性：三條路線

| 路線 | 能保證的內容 | 本輪判定 |
|---|---|---|
| 純外部工具、原版保持開啟 | Ctrl+S事件／timer／已提交SQLite的單庫副本；可做保守dirty hint | **不能保證當前editor已寫入**，不滿足完整需求，不能標成「全部修改已備份」 |
| 原版有可靠公開flush／擴充API | 若能回editor＋commit revision ACK並配合writer barrier，可保留DB/renderer | 本輪未找到已驗證入口；MCP目前停用，已讀官方功能與內部backup handler不證明具全域flush |
| 程式內最小保存bridge，限定隔離副本 | 暴露既有editor flush、追蹤KD／transaction、背景jobs／附件一致性，可供同一Ctrl+S與timer協調器使用 | 技術上是能達完整語義的方向，**尚未證明可接入原版且不破壞行為**；須確認可用hook／source授權與隔離，不先patch正式安裝或做版本脆弱的生產注入 |

本輪精確字串檢查列出triggerBackup、createManualLocalBackup等handler，沒有發現明確命名的全域flush handler；這只是有限搜索，不是證明任何版本永遠不可能存在。MCP唯讀核對只顯示enabled=false/readOnly=false/39125，沒有讀出token或改設定。

已有19311 configureCanvasHost是程式內宿主依賴注入點，不是對外plugin入口；34883的X()是元件內closure，本地flush及unmount會調onSave，但不是跨全部視窗、200ms上游狀態、IPC與transaction都完成的Promise。因此不把「有adapter」直接等同「外部工具可可靠flush」。

替代方案若無可用bridge：可提供明確標為「已提交DB版本」的背景快照，或使用者明確停止編輯／退出後的保守備份；它們均不能替代本階段完整目標。不得以固定sleep、quiet期或假設退出必flush來改寫驗收標準。

## 下一階段最小實作方案（尚未開始整合）

### Gate A：隔離啟動先行

優先Windows Sandbox／VM或經驗證的獨立Windows profile。隔離DB、main.db、userFilePath、electron-store、session/partition、單實例鎖、protocol註冊、更新／雲同步副作用。僅啟動--user-data-dir不足以證明這些已隔離；既有source可見production路線會註冊flexnote協定。

先用合成workspace；確認所有寫入落在沙箱、沒有轉送到正式instance，才考慮私人真實DB／724附件。不拷正式token、登入或授權保護；若啟動隔離證明失敗，停止原版E2E。

### Gate B：只證明一個真實editor的flush ACK

先確認可信的程式內hook或官方支援方式，再新增最窄bridge，不改renderer、Knex或schema。測輸入最後字→立即要求flush→已提交revision ACK→Backup API→讀副本比對最後內容。測延遲IPC、保存錯誤及IME；組字未安全結束時回pending，不偽造成功。

bridge必須追蹤原本fire-and-forget的持久化Promise與主程序transaction，不能只等onSave被呼叫。暫不把單editor通過宣稱全應用通過。

### Gate C：writer barrier與dirty detector

新增明確狀態：PREPARING→FLUSHING→QUIESCENT→CAPTURED→RELEASED。先暫停新mutation的admission，但允許帶requestId的flush批次與既有操作完成；隨後固定revision，暫停背景job及附件變更，再擷取同代DB／catalog／asset revisions。若先完全禁止SQL再等待flush，會自鎖；目前withBarrier包含flush但未定義這個契約，這是整合前必須解決的風險，不宣稱原型已發生死鎖。

只有實際editor／DB／asset revisions全未變且baseline有效才跳過備份。data_version可輔助偵測外部提交，必須固定連線及epoch，不單獨當保存版本號；重連或偵測未知writer時保守重驗。

### Gate D：同一保存流程掛Ctrl+S與10分鐘timer

兩種trigger使用同一coordinator及單一capture queue；不是寫兩套保存程式。有變更才發布，capture之後的新編輯仍dirty。正常close等待同一ACK；background/suspend僅best effort，不擋系統、不標未完成為成功。測試no-op不呼叫backup/hash，而不是只檢查created=false。

### Gate E：P0載入與catalog

載入僅操作經驗證的目標workspace；先保存目前修改、取得真實close/worker ACK或安排受控重啟，做不到即拒絕。不要以「所有FlexNote.exe都關閉」取代資料路徑owner檢查。路徑用realpath／大小寫與OneDrive根辨識，活動原檔與交換區分離；本輪不移動任何現用資料。

同屏障保存選定workspace的實際catalog欄位／必要歸檔。staging還原只upsert該workspace，不整個覆main.db、profile或其他空間。跨根目錄切換及重啟後load-intent恢復須另驗，不能靠現有catch宣稱斷電安全。

## 最小驗收與停止條件

- 真實隔離editor立即Ctrl+S、延遲提交與IME：副本與已確認editor revision一致，錯誤不出成功標記。
- 無變更兩次trigger：第二次backup/hash呼叫數為0；asset-only、標籤／屬性、其他視窗／背景提交不可漏。
- 新編輯與timer同時：舊capture完成後新revision仍dirty，不重入、不重複相同版本。
- 實體handle拒絕close、pool/worker未退出：load拒絕且原資料保持；另一個隔離FlexNote instance不應僅因名稱相同被誤擋。
- 同一scope catalog＋workspace捕捉、空catalog還原、其他workspace完全保留；成功後才驗原版側欄／跨板／附件／歷史／搜尋。
- OneDrive true placeholder/partial與hash失敗：未完成不讀payload、不切換；不判所有reparse為未下載。

若無法取得可信flush／commit bridge，結論就是「完整運行中保存尚不可交付」，不以加sleep或更長quiet window假裝通過。本輪到審查處置與方案為止，沒有開始大範圍整合。

## 來源

- 本機程式：snapshot-prototype.cjs:85–96、123–174、237–278；snapshot-prototype.test.cjs的11個test與audit-native-backup.cjs。
- 私人既有AST：34883 editor adapter、48626 callback、28862 history策略；main bundle SHA 9ed2877f…，requestSingleInstanceLock在Python code point210314，protocol註冊626154。offset單位以既有receipt為準，不當行號。
- [SQLite data_version官方語義](https://sqlite.org/pragma.html#pragma_data_version)：同連線比較、僅其他連線提交有指示，非跨連線持久版本。
- [Windows CreateFile sharing](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)：delete/rename是否允許取決於分享模式。
- [Windows attributes](https://learn.microsoft.com/en-us/windows/win32/fileio/file-attribute-constants)：reparse、offline、recall、pinned為不同資訊。
- [Electron app生命周期](https://www.electronjs.org/docs/latest/api/app)：before-quit不是所有Windows系統退出情況都會發生；userData/sessionData、單實例與protocol皆須考慮。
