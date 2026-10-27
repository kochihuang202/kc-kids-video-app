# 裝置離線下載

## 使用方式

1. 在需要離線播放的 iPhone／iPad 上連接 Wi-Fi、Tailscale，登入家長管理中心，並確認它已是家庭授權裝置。
2. 開啟家長管理中心的「離線下載」，選擇要儲存在目前裝置的 Mac 自架影音系列。
3. 下載時保持小小選片在前景。中斷或離頁後，回到同一頁按「繼續下載」即可；已完成的單部影片不重抓。
4. 孩子端不顯示下載按鈕或儲存資訊；離線時仍從原本的分類與影片入口播放本機檔案。
5. 「刪除」只清除目前裝置的該系列，不影響 Mac、其他裝置、分類、學會狀態與觀看紀錄。

每台裝置的瀏覽器儲存空間彼此獨立，因此必須分別進入家長管理中心下載。Safari 與加入主畫面後的 Web App 也可能使用不同的儲存空間，請固定從實際要播放的入口完成下載。

離線播放時只在裝置上暫存「看過哪部影片」與觀看／純聽模式。裝置恢復連線後會自動同步這個標記，讓「最近看過」與家長紀錄可見；不補建播放 Session、不回填秒數，也不影響休閒額度或學習統計。

YouTube 不提供下載。若某部影片曾屬於下載系列，但裝置檔案已被系統清除，播放器會先詢問是否使用網路串流，不會默默消耗流量。

## 技術設計

- 影音逐塊寫入 Origin Private File System（OPFS），不把整部影片放進記憶體。
- 只有完整寫入、關閉且檔案大小核對成功後才標記完成。
- 分類、影片與授權狀態留下小型本機快照；系列的影片縮圖另外存入專用 Cache Storage，Service Worker 在離線時提供縮圖。App 外殼採快取優先，離線冷啟動不等待網路逾時；每次部署的新版本仍會在 Service Worker 安裝時更新外殼。它不快取 API、Cookie 或媒體串流。
- 從「已下載」進入播放器時直接讀取本機快照，不等待網路；其他入口若網路介面仍顯示在線但 API 沒有回應，會在短暫等待後自動使用快照。
- 本機 Blob URL 接回既有 NativeMediaPlayer，因此觀看、純聽、循環與自動接續沿用同一套邏輯。
- 下載及刪除使用 Web Lock，避免兩個分頁同時改寫相同檔案。
- 已經下載過影音的系列再次按下載時，只補齊缺少的縮圖，不會重抓完整影片；刪除系列時也會清除不再被其他下載系列使用的縮圖。
- 呼叫持久儲存申請並顯示結果；程式不設定期限、不主動清除，但使用者清除網站資料或作業系統回收儲存空間後仍需重新下載。
- iOS／iPadOS 需要 26 或以上才能使用目前採用的 OPFS 串流寫入能力。

### 清單配額與影音配額（REG-071）

「點離線下載頁籤就出現 The quota has been exceeded」可能發生在更新文字清單，尚未開始寫入影音。不能只依這句訊息判定手機容量已滿，或把網站總配額估計當作手機實際剩餘容量。

- `kids-downloads-v1` 保存已下載系列的影片資料、完成檔案大小與 MIME。以這份目錄作為離線影片及分類快照的備援，不再於下載或更新清單時另外複製每部影片的完整快照。
- 更新目錄成功後移除該系列重複的影片／分類 API 快照；這些資料可由目錄提供。一般連網讀取仍可快取最新 API 回應。
- 目錄寫入遇到 `QuotaExceededError` 時，只移除可重建的影片／分類影片列表 API 快照，重試一次。保留根分類、裝置授權與可播放狀態快照，以及下載目錄、OPFS 影片、縮圖、音量／速度、待同步看過標記與診斷事件。不得使用 `localStorage.clear()`、自動刪除影片或要求重裝 App。
- 若目錄本身仍放不下，保留舊目錄，以中文說明清單空間不足；頁面仍顯示已下載系列與刪除入口。清單更新或網路載入失敗不得把整個管理列表藏掉。
- 失敗時透過既有授權裝置診斷 API 回報一次，無持續輪詢。`diagnosticVersion=download-v1`、`errorOperation=catalogue_refresh|catalogue_save|media_storage` 區分階段，另記錄 localStorage／目錄估計位元組、嘗試儲存的目錄大小、已標記完成的影音位元組，以及 Storage API 使用量／上限。`DOWNLOAD_CATALOGUE_QUOTA` 與 `DOWNLOAD_MEDIA_QUOTA` 不混用。這些是診斷 Session，不新增觀看 Session 或計時；延用錯誤明細 30 天的保留政策。診斷失敗不阻塞管理畫面，也不嘗試寫入已滿的文字儲存空間。

平台參考：[WebKit 儲存政策](https://webkit.org/blog/14403/updates-to-storage-policy/) 說明主畫面 Web App 配額，以及 `estimate()` 的上限不保證等於實際可寫入容量。真機是哪一階段失敗，須依診斷確認。

## 維護與驗證

- 主要程式：`src/lib/downloads.ts`
- 畫面：`src/components/Downloads.tsx`
- 離線外殼：`scripts/offline-shell.ts`
- 完整流程測試：`e2e/features/download-series.spec.ts`
- 配額回歸：`e2e/regressions/download-catalogue-quota.spec.ts`；真實 localStorage 配額壓力 → 點頁籤 → 清單可管理 → 保留檔案／設定 → 離線播放，另覆蓋重試後仍不足的提示、刪除入口與診斷。
- 診斷契約：`test/diagnostics.spec.ts` 的 REG-071，驗證 Worker 實際寫入／重播／匯出，不新增觀看歷史。
- 一般測試：`npx playwright test e2e/features/download-series.spec.ts`
- 含離線重開的 production build 測試：先以 `dist/client` 啟動 preview，再設定 `PLAYWRIGHT_BASE_URL` 與 `PLAYWRIGHT_TEST_OFFLINE_SHELL=1` 執行同一測試。

Mac 媒體伺服器必須允許正式 App Origin 的 CORS，並暴露 `Content-Length`／`Content-Type`。下載時應回傳完整檔案（HTTP 200）；HTTP 206 不會被當成完成檔案。

### 2026-10-27 配額修正驗證

- 新增的兩個 REG-071 流程在修改前均於點頁籤後失敗；修改後通過。
- `test/diagnostics.spec.ts` 與 `test/offline-shell.spec.ts` 共 11 項通過；production build 通過。
- 完整 Playwright 63 項中 62 項通過。既存的 `e2e/features/learning-leisure-flow.spec.ts:90` 要求「🔒 先從前五部選擇」，現行 HEAD 的畫面文字為「🔒 尚未解鎖」，仍失敗；未刪除、跳過或放寬斷言。
- production build preview 啟用 `PLAYWRIGHT_TEST_OFFLINE_SHELL=1`，下載／續傳／縮圖／離線重開及兩個配額流程共 3 項通過。瀏覽器測試確認實際 OPFS 檔案與時間前進，不能代替實體 iPhone 的音訊與儲存狀態驗收。
