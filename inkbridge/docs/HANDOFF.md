# InkBridge 交接說明

最後更新：2026-11-26（Asia/Taipei）。寫給接手的 AI 或開發者：日常怎麼改、怎麼測、怎麼合併，最近做了什麼，還有哪些事在等使用者決定。

後續程式發布統一使用 scripts/original-reuse/deliver-release.cjs。它會比對可攜版實際升級的驗收收據，驗證完整 ZIP 與實測增量 ZIP 寫入 OneDrive 後才清除舊完整程式包及該次成功測試的暫存。最新與增量基底的本機建置會保留，筆記快照沿用獨立的既有保留規則。

最新交付 0.9.5（REG-184，程式 commit `bb0ecfb`，發布序號 37）。整張筆記卡片的 Ctrl+X/Ctrl+V 以單一交易移動位置，保留原卡片內容與 ID，並支援目標白板的復原和重做。網頁閱讀器保留巢狀群組座標，接回桌面心智圖排版與配色。Cloudflare 正式閱讀器 `inkbridge-reader-0eaa033640f9` 已部署，使用實際線上資源與隔離合成資料驗證。相關 Node、Chrome、可攜 Electron 與 0.9.4 升級測試通過。OneDrive 完整包 `InkBridge-release-0.9.5-27d2e33a-c53f-4a03-8529-cc54def4f0cf.zip` 與增量 `InkBridge-update-dc102dac-9aea-44c4-96e8-9d55fb12b046.zip` 已驗證，舊完整包已清除。收據為 `release/delivery-0.9.5.json`。

最新交付 0.9.4（REG-183，程式 commit `663ba80`，發布序號 36）。彩虹心智圖的筆記卡片與白板 @ 連結都使用高對比字色、圖示和底線。原生 @ 選單在開啟時接收 Enter，關閉後 Enter 完成節點編輯。已實測鍵盤插入、保存重開、畫布像素及 0.9.3 增量升級。OneDrive 完整 ZIP 為 `InkBridge-release-0.9.4-5ee1795e-e5ab-4cfc-b713-b0bbf42547a7.zip`，增量為 `InkBridge-update-dd171eee-d851-4189-b5e1-a181f1805f59.zip`。舊 0.9.3 完整包已清除。本機交付收據為 `release/delivery-0.9.4.json`。

最新交付 0.9.3（REG-182，程式 commit `67ade06`，發布序號 35）。彩虹心智圖的 @ 白板連結依底色選擇黑白字色，保留同色圖示並加底線。畫布像素、重開、原生編輯器的白板跳轉與 0.9.2 增量升級均已驗證。OneDrive 完整包為 `InkBridge-release-0.9.3-1d6a7daa-3e98-4965-903f-26110fcc3ba7.zip`，0.9.2 增量為 `InkBridge-update-6e37a8f0-8f39-4530-8e5f-48b9482ad39a.zip`。舊的 0.9.2 完整包已清除。本機交付收據為 `release/delivery-0.9.3.json`。

最新交付 0.9.2（REG-179 至 REG-181，程式 commit `2b9222f`，發布序號 34）。心智圖左右主分支共用固定 20 色，子節點及連線沿用分支色，手動改色仍優先。開發與封裝的心智圖測試均通過，隔離的 0.9.1 增量更新測試確認重開與最後一筆中文編輯保存。OneDrive 完整包為 `InkBridge-release-0.9.2-c389c768-6a7b-40d5-9fd8-b96d8f0354f7.zip`，0.9.1 增量為 `InkBridge-update-93ad503e-855c-49cc-950c-db6fceb6b4bf.zip`。已清除舊的 0.9.1 完整包。本機交付收據為 `release/delivery-0.9.2.json`。心智圖中以 @ 插入的白板連結仍需改善文字與底色的對比。

最新交付 0.9.1（REG-178，程式 commit `b2effbe`，發布序號 33）。群組操作改用完整場景更新，保留心智圖。白板單獨建立的表格可用選取工具列刪除並保存。兩項 Electron 回歸均先重現失敗再通過，另有四項相關 Node 測試、封裝表格刪除重開及隔離 0.9.0 更新重啟通過。OneDrive 完整包為 `InkBridge-release-0.9.1-adf0e52f-4d5f-4104-a0d8-207b79cb4cc3.zip`，0.9.0 增量為 `InkBridge-update-ccfbac8a-7087-4a98-9025-e15464f3a669.zip`。已清除 0.9.0 舊完整包。交付收據為本機 `release/delivery-0.9.1.json`。

最新交付 0.9.0：見 [RELEASE_0_9_0.md](RELEASE_0_9_0.md)、[TAGS_PORT.md](TAGS_PORT.md)、REG-177。完成原版 1.1.70 標籤父頁、分組／子孫／改名／搜尋／集合與 metadata 服務。保留子孫搜尋路徑，更新 canonical Redux 防止舊名覆回，新增仍由原版動作避免重複。補系統 tag/collection/view 的穩定唯讀投影及首次有效寫入，表格初始化 null/default 欄位不產生共享版本；真正修改保存。新 metadata 經跨視窗預條件、合併關聯／循環及快照驗證；刪標籤保留筆記。50 項 Node＋最後集合／筆記6項通過，開發／封裝 check-tag-page、舊 check-native-tags、0.8.1 真更新重開通過；三條直升 Stage、完整 ZIP 3542 檔驗證通過。OneDrive 只留 0.9.0 完整 ZIP，BAT 在 ZIP 內。原生 AG Grid 告警／AI 圖示與其他欄位檢視驗收界線記在 release；未操作另一台實機。來源重建須先 prepare-tags，collect 不可漏掉 overlay 自身缺少依賴與動態 chunk IDs。下列為前版紀錄。

最新交付 0.8.1：見 [RELEASE_0_8_1.md](RELEASE_0_8_1.md)、REG-176。正式唯讀重現 0.8.0 啟動「版本關係紀錄衝突」：舊 0.7.8 曾快取新合併快照，投影掉 mergeDigest；同 ID 的 DB 雜湊、長度及父版本相同。只允許同一不可變 DB 身分下補齊缺少的新欄位，真差異仍拒絕；不改正式筆記／不可變紀錄。27 項相關 Node、修改後 12 項實際 merge/index、開發及最終封裝 Electron 舊快取重開／後續同步／最後中文保護通過。複製的 0.8.0 實際按更新到 0.8.1、健康重開及最後中文保留通過；0.8.0／0.7.8 直升 Stage、完整 ZIP 3541 檔驗證通過。OneDrive 只留 0.8.1 完整 ZIP，另有兩條直升 ZIP，BAT 在 ZIP 內。未操作另一台實機、未在正式工作區還原或指定本機。這台開發入口需正常重開才載入修正；不能再把缺少新版欄位解釋為真資料衝突。下列為前版紀錄。

最新交付0.8.0：見[RELEASE_0_8_0.md](RELEASE_0_8_0.md)及[合併／指定本機規格](SYNC_MERGE_AND_AUTHORITY.md)。不同白板／卡片／欄位三方合併，真衝突逐項選擇並記住草稿；文字與文件、原版座標鏡像不拆錯。新增設定「以這台為準，讓其他電腦對齊」：按世代對齊一次，對方未同步修改先完整備份，之後正常編輯不反覆重設；並行指定要求再次明確選擇，不按時間猜。60項相關Node、開發／封裝雙程式合併與對齊、原視窗／還原／組字相關回歸、0.7.8實際ZIP升0.8.0及四條直升Stage通過。OneDrive完整包只留0.8.0，BAT在ZIP內；正式筆記未動，未操作另一台實機。兩台都須換用0.8.0；這台開發入口正常重開即可載入。舊版已清掉的共同基準不猜測，可明確指定本機。下列為前版紀錄。

最新交付0.7.8：見[RELEASE_0_7_8.md](RELEASE_0_7_8.md)。修正HTML完整驗證與自動同步索引的副檔名規則不一致、outbox漏傳bytes而拒絕空CSS。使用者v2149及126附件唯讀完整雜湊均通過，是誤判而非缺檔。開發／封裝版含HTML自動接最新、多視窗／組字／真修改保護通過；複製的0.7.7實際按更新升0.7.8、重開和最後一筆中文保留通過。完整ZIP與0.7.5／0.7.6／0.7.7直升ZIP已在OneDrive，只移除舊0.7.7完整包，未改正式筆記。這台執行開發入口，正常重開原入口即可載入修正；未操作另一台實機，使用者獨立程式更新錯誤仍缺確切文字。下列為較早版紀錄。

最新交付0.7.7：見[RELEASE_0_7_7.md](RELEASE_0_7_7.md)及[HTML來源紀錄](RELEASE_0_7_6.md)。完成原版HTML拖入、完整本機相依資源CAS、網頁卡片、保存重開、快照轉移及R2／離線分享。補齊原版UTF-8回應，沒有charset的中文及inline／module JS也實測。封裝版自身匯出、Chrome與真實Cloudflare固定網址更新／停用通過；正式筆記未動。OneDrive完整包只留0.7.7，另有0.7.5／0.7.6直升ZIP。兩台需換用新版；跨機以隔離工作區驗證，未操作另一台實機。下列為前版紀錄。

最新交付0.7.5：見[RELEASE_0_7_5.md](RELEASE_0_7_5.md)。修正編輯待辦時一般清單CSS多加20px縮排，移植FlexNote1.1.70編輯專用黑／白框；正常選取色保留。實際DOM／Canvas文字量測、黑框像素、中文保存與重開、編輯生命週期、分頁／提示區塊相關回歸通過。最終可攜版與簽章更新Stage通過；OneDrive完整包只留0.7.5，0.7.4增量7159615 bytes。未動正式筆記及另一台實機。下列為前版紀錄。

最新交付0.7.4：見[RELEASE_0_7_4.md](RELEASE_0_7_4.md)。依FlexNote1.1.70接通原版聚焦設定及Canvas選取繪製鏈；12%預設、0–100%不透明度，相連卡片／線條獨立控制。裝置localStorage保留，不寫共享版本。來源、實際像素測試、重開、相關檔名設定回歸與封裝版通過；OneDrive完整包只留0.7.4，0.7.3增量155916 bytes。下列為前版紀錄。

最新交付0.7.3：見[RELEASE_0_7_3.md](RELEASE_0_7_3.md)。依目前安裝的FlexNote1.1.70移植完整日記／待辦父頁面與依賴，接入既有SQLite、保存協調器與工作區快照。封裝版已驗證日期檢視、搜尋、統計、來源勾選雙向回寫、從待辦編輯日記、跳轉與重開不增加版本；兩台需換用新版才能使用新介面。下列為前版紀錄。

最新交付0.7.2：見[RELEASE_0_7_2.md](RELEASE_0_7_2.md)。接共同最新版沿用收到的ID；SHA驗證後逐列比較證明的假還原分支可自動接續，真正修改及歷史還原保留。相關Node測試13項、封裝版接續／還原Electron流程及簽章更新Stage通過。OneDrive完整包只留0.7.2，另有0.7.1直升142054 bytes增量。未操作另一台實機。下列為前版紀錄。

最新交付已為0.7.0：見[RELEASE_0_7_0.md](RELEASE_0_7_0.md)，唯一新版完整ZIP已在OneDrive；舊完整包與啟動側檔已清理，正式筆記未改。新協定分離lineage與完整備份，設定自動掃描、日期排序、保護本機後還原並建立forward版本。舊已遺失祖先證據仍不可猜測，首次必要時須明確選最新版。下列0.6.3敘述為較早歷史。

最新版本：0.6.3 修正歷史清理後落後電腦誤判分支／首次配對重複候選，見 [`RELEASE_0_6_3.md`](RELEASE_0_6_3.md) 與 REG-166。使用者要求完整 ZIP；OneDrive 不能同步 BAT，所以啟動及診斷 BAT 必須在 ZIP 裡。另一台的同步基準尚未取得，不能強制覆蓋或宣稱全部問題已解決。0.6.2 交付紀錄見 [`RELEASE_0_6_2.md`](RELEASE_0_6_2.md)。

開發原則不在這裡重複，請先讀：

1. [`AGENTS.md`](../AGENTS.md)：先查原版（REA），能重用原模組就重用；查不到來源要先和使用者討論，不可自行設計或加 fallback。
2. [`docs/DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md)：完整流程與證據要求。
3. [`../../docs/REGRESSIONS.md`](../../docs/REGRESSIONS.md)：每次修改的原因、做法、測試（InkBridge 相關是 REG-095 之後）。改到某個功能前，先搜尋它的 REG 條目。新條目加在檔案**最上方**（最新的在前），檔案是 CRLF 換行。

## 1. 目錄、分支與合併

| 項目 | 位置 |
|---|---|
| Git 根目錄 | `C:\Users\ji3cp\Documents\ChatGPT\try`（同一個 repo 裡還有其他專案，只提交 `inkbridge/` 與 `docs/REGRESSIONS.md` 中本次相關的變更） |
| 整合分支（主目錄） | `codex/inkbridge-editor-rebuild` |
| 工作方式 | 從整合分支開自己的分支和 worktree（`.worktrees/<功能名>`），完成後 commit，再在主目錄 `git merge --ff-only <你的分支>` |
| 推送 | 依使用者最新 Git SOP，開始先 pull，目前任務測試通過後主動 commit 並 push 目前分支。只納入本次範圍；較早的禁止推送約定已由最新明確指令取代。 |

主目錄的工作區常有其他專案未提交的修改（例如 `e2e/`、`storybooks/`），不要動它們，也不要一起提交。

## 2. 修改原版模組的方式

- 原版模組放在 `private-original-editor/source-modules/module-<id>.cjs`，**不在 Git 裡**（專有程式）。新的 worktree 要從主目錄的 `inkbridge/private-original-editor` 實體複製，排除 `profiles/`。
- 對原模組的修改一律寫成**可重複執行的 patch 腳本**：`scripts/original-reuse/apply-*-patches.cjs`，並串在 `apply-integration-patches.cjs` 裡。改完執行：

  ```bash
  node scripts/original-reuse/apply-integration-patches.cjs
  node scripts/original-reuse/collect.cjs
  ```

  `collect.cjs` 會重建 `private-original-editor/register-original.js`。主目錄合併後也要跑這兩行，使用者用 `Start-InkBridge.bat` 開的才是新版。
- patch 腳本的寫法：用原文當錨點（空白不敏感）、檢查錨點只出現指定次數、用標記字串避免重複套用，套完用 TypeScript 解析器檢查語法。照既有腳本的樣子寫，例如 `apply-media-file-name-patches.cjs`。
- **陷阱**：不要用另一個 `once()` 去修改先前另一段插入的文字，那段插入會被重新套用一次。要改就把修改併進原本那段插入，並加上「已套用版本就地升級」的處理（見 `apply-video-record-patches.cjs` 的 YouTube 部分）。
- 模組 46979、78178 只能由 `prepare-sharing.cjs` 修改，它會從 `.before-sharing` 備份重建。
- 不是原模組的 InkBridge 程式（主程序 `src/main/`、殼層 `scripts/original-reuse/*.mjs`、`compact-shell.css`）直接改，會進 Git。

## 3. 執行與測試

- 使用者用 `inkbridge/Start-InkBridge.bat` 啟動，資料在 `private-original-editor/profiles/desktop/`（這是**使用者真實資料**，測試不可使用）。
- 實機測試腳本：`scripts/original-reuse/check-*.cjs`（Playwright 控制 Electron），單元測試：`tests/*.test.cjs`（`node --test`）。
- **只跑和本次修改相關的測試與歷史回歸**，不要每次全部重跑。實機測試會跳出視窗，使用者不喜歡畫面一直跳，跑之前心裡先有清單。
- 測試環境的眉角：
  - 執行前清掉環境變數 `NoDefaultCurrentDirectoryInExePath`（`unset NoDefaultCurrentDirectoryInExePath`），否則和 BAT 有關的測試會失敗。
  - 測試資料夾必須是系統暫存區裡以 `inkbridge-original-modules-` 開頭的資料夾，`host.cjs` 才會接受。測完要刪掉。
  - 影片類測試需要 `ffmpeg`（產生合成影片）；`check-youtube.cjs` 需要網路。
  - 一律用合成資料，不碰正式 FlexNote 或使用者筆記。
- 檔案換行格式：`docs/REGRESSIONS.md` 是 CRLF，其他檔案是 LF。用 Python 寫檔時注意不要改掉換行格式，提交前比對一下。
- `check-shell-parity.cjs` 會在 `private-original-editor/` 寫結果圖檔，那個資料夾不在 Git，不影響提交。

## 4. 最近完成的工作（2026-11-14～15）

細節都在對應的 REG 條目。

| 功能 | REG | 主要檔案 |
|---|---|---|
| 提示文字不被視窗按鈕擋住 | 152 | `tooltip-titlebar.mjs` |
| XMind 心智圖分支顏色、自訂顏色視窗在選單上層 | 153 | `src/core/mindmap-appearance.mjs`、`mindmap-xmind-keys.mjs` |
| 貼圖片時心智圖消失 | 154 | `board.mjs` |
| 分享：每個白板固定網址、預設包含子白板、主要發布按鈕、複製網址；字型子集與閱讀器快取 | 無（見 `docs/SHARING_RELEASE.md`） | `share-site/_worker.js`、`web-share.mjs`、`prepare-sharing.cjs`、`src/main/share-fonts.cjs` |
| 卡片中的連結用瀏覽器開、本機檔案先詢問、資料夾路徑可當連結 | 155～156 | `src/main/open-links.cjs`、`apply-link-path-patches.cjs` |
| 圖片／影片檔名開關分開，每個白板各自設定 | 157 | `media-file-names.mjs`、`apply-media-file-name-patches.cjs` |
| YouTube 影片卡片（本機播放頁、標記截圖、📍 跳回） | 158 | `src/main/youtube.cjs`、`apply-youtube-patches.cjs` |
| 高亮面板大圖模式 | 159 | `apply-highlight-image-mode-patches.cjs` |
| 百度網盤影片卡片 | 160、162、163 | `src/main/baidu-disk.cjs`、`apply-baidu-patches.cjs`、`original-shell.mjs` |
| YouTube 卡片上方「紀錄」按鈕可點 | 161 | `board.mjs`（`videoToolbarMore`） |
| 版面：白色外框、圓角灰色白板、右上分頁緊靠 | 164 | `compact-shell.css`、`check-shell-parity.cjs` |
| OneDrive 交換資料夾有其他工作區時不再一直跳「等待資料到齊」；11/2 的舊測試工作區已移到 `01_Home\InkBridge-舊測試工作區-7e967fbe`（未刪除） | 165 | `src/main/live-sync.cjs`、`check-seamless-sync.cjs` |

## 5. 外部服務與憑證

### 百度網盤（REG-160、162、163）

- 用的是**使用者自己**在百度開放平台註冊的應用，不可使用 FlexNote 內建的百度金鑰。
- AppKey／SecretKey 加密存在 `profiles/desktop/Profile/baidu-app.json`，登入權杖存在同資料夾的 `baidu-token.json`。加密金鑰在 **`Session/Local State`**（不是 `Profile`），因為 `host.cjs` 把 sessionData 設在 `Session`。要另外寫入金鑰時，Electron 的 `userData` 和 `sessionData` 都要設得和 `host.cjs` 一樣，否則會用錯金鑰加密。
- 目前**沒有輸入金鑰的設定畫面**。換電腦、做可攜版，或使用者重設 SecretKey 時，需要再寫入一次。
- 登入用百度的「設備碼登入」：開瀏覽器、顯示代碼，不需要回呼網址。
- 播放：主程序把百度的串流清單和片段轉成本機 `/baidu-media/<id>` 位址轉送，權杖不進頁面；片段請求加 `Referer: https://pan.baidu.com`。播放失敗會寫入 `Profile` 旁邊的 `Logs/baidu.log`（網址已去掉查詢字串和權杖）。
- 預設封面：匯入時用百度的縮圖（`filemetas thumb=1`），啟動時也會替還沒有封面的百度卡片補上。白板畫布會快取已畫好的內容，更新封面後要調用原版的 `bumpEpoch` 重畫（見 `original-shell.mjs` 的 `fillBaiduCovers`）。
- 測試用 `check-baidu.cjs` 的本機假百度伺服器（環境變數 `INKBRIDGE_BAIDU_TEST_ORIGIN`，只在暫存測試資料夾有效），不連真正的百度。使用者曾以自己的帳號實測，可以登入、瀏覽、播放。

### YouTube（REG-158）

標題和封面用 YouTube 公開的 oEmbed，不需要金鑰；原版用的是 FlexNote 自己的 YouTube Data API 金鑰，已替換掉。只放行播放器需要的 YouTube 網域。

### 分享網站（Cloudflare Pages）

部署指令和步驟見 `docs/SHARING_RELEASE.md` 與 `docs/READ_ONLY_WEB_SHARE.md`。**部署前一定要先得到使用者同意。** 部署指令需要在沙箱外執行，wrangler 才能更新登入。

## 6. 等使用者決定或尚未完成

- **表格的編輯／一般顯示差異**：已說明是原版行為（原版會縮放欄寬塞進卡片），使用者還沒選「維持原版」或「編輯時也縮放」。
- **影片紀錄頁的獨立視窗**：使用者表示 FlexNote 開成獨立視窗也不能做紀錄，維持現狀即可；按下時只會在命令視窗留一行錯誤，不影響使用。
- **YouTube 卡片顯示「YouTube影片」**：判斷是卡片標題手動填的；若使用者重貼網址仍抓不到標題，再查那個網址。
- **百度網盤**：沒有金鑰設定畫面；上傳和用網盤同步筆記不在這次範圍。
- 較早清單中尚未開始：閱讀模式的大截圖、XMind 字體大小、高亮總覽中的 PDF／音訊／筆記高亮、可攜版 profile 的既有分享金鑰可能無法解密（未確認；新裝置應使用配對，不複製加密檔）。可攜版 0.6.2 發版已完成，見上述收據。

## 7. 和使用者合作的習慣

- 用**繁體中文**回覆，避免英文說明。
- 推送、部署、發版、刪除資料前先問。
- 先說明理解再動手；使用者常附 FlexNote 截圖對照，以截圖和同版原碼為準。
- 跑測試會跳出視窗，盡量合併、減少次數，並說明為什麼要跑。
- 用合成資料測試；擷取的 FlexNote 檔案和使用者資料的暫存副本用完要刪掉。
