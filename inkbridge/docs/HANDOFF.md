# InkBridge 交接說明

最後更新：2026-11-16（Asia/Taipei）。寫給接手的 AI 或開發者：日常怎麼改、怎麼測、怎麼合併，最近做了什麼，還有哪些事在等使用者決定。

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
| 推送 | **不要推到 GitHub**（使用者 2026-11-14 決定）。同電腦的 AI 直接用本機 repo 協作；要推送、部署或發版，先等使用者明說 |

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
