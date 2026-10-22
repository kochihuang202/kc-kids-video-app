# 播放診斷維運手冊

這套診斷用於判斷問題發生在孩子裝置、瀏覽器／iOS、Cloudflare、YouTube，或家中 Mac／Tailscale 媒體服務。它不保存密碼、Cookie、影音內容或完整媒體網址。

## 保存內容

- 沿用家長在「設定」為裝置取的名稱，並記錄瀏覽器、作業系統、視窗尺寸、PWA 模式與網路類型。
- 保存播放來源（YouTube／自家媒體）、觀看／純聽模式、播放器狀態、seek、重試、錯誤、切換背景與下一集事件。
- 自家媒體在開始播放時檢查 Mac `/health`；重試或錯誤時檢查 `/diagnostics/deep`，並保存延遲、request ID、Server-Timing、Tailscale 與媒體目錄狀態。
- Cloudflare 端只保存遮罩後的 IP prefix 與不可逆 HMAC hash；家長頁和唯讀匯出不回傳完整 IP 或 hash。

## 保留規則

- 每台裝置成功紀錄只留最近 100 次。
- 發生錯誤或重試的詳細事件保留 30 天。
- 超過 30 天的錯誤先彙總到 `diagnostic_error_rollups`，再刪除詳細事件與 Session。
- 清理最多每 6 小時由一次正常診斷寫入觸發，不使用持續 polling，也沒有家長手動刪除端點。

## 家長查看

登入後開啟 `/parent/diagnostics`。畫面可按裝置與結果篩選，展開單次 Session 查看事件時間線。

## Codex 唯讀查詢

正式環境提供：

```text
GET /api/diagnostics/export?limit=50
Authorization: Bearer <DIAGNOSTICS_READ_TOKEN>
```

加上 `deviceId`、`outcome`、`since` 可縮小範圍；加上 `sessionId` 才會回傳該次詳細事件。Token 是 Cloudflare Worker Secret，禁止寫進 Git、Log 或文件。查詢端應從本機被 Git 忽略的 `.dev.vars.diagnostics` 讀取。

## Mac 媒體服務

Mac 端程式位於 `origin/codex/mac-media-diagnostics` 的 `mac-media-server/`，目前核准版本為 `ec6cf0e`。不要把該分支整體 merge 到目前分支，因為分支基底較舊；只在需要維護 Mac server 時取用該目錄。

瀏覽器的診斷 HEAD request 會傳 `X-KC-Diagnostic-Id`，Mac 回傳 `X-KC-Request-Id`、`X-KC-Service-Version` 與 `Server-Timing`。實際 HTML media stream 受瀏覽器限制，無法自行附加這個 header，因此目前的跨端關聯以診斷 probe 為主。

## 相關測試

```powershell
npx vitest run test/diagnostics.spec.ts test/d1-cost-regressions.spec.ts
npx playwright test e2e/features/playback-diagnostics.spec.ts e2e/regressions/media-auto-retry.spec.ts
```

診斷失敗不得阻斷播放；前端暫時送不出的批次只在本機保留最近 20 批，之後使用相同事件序號重送，D1 以 `(diagnostic_session_id, event_seq)` 去重。

## 2026-10-22：背景播放與重試診斷 v2

- 新紀錄的 `page_opened.detailJson.diagnosticVersion` 為 `playback-v2`；每筆事件附頁面可見性、來源種類（`blob` 本機下載、`remote` 串流、`youtube`）、當前位置、播放意圖與重試剩餘時間。
- 自家播放器另附 `readyState`、`networkState`、緩衝秒數、暫停／結束／seek、音量／靜音、播放速率與待處理 play promise。`native_media_event` 區分 source change、載入、stalled、suspend、abort、play resolve/reject、鎖屏系統 play/pause 及前景恢復嘗試。事件沒有記錄完整影音網址。
- 播放拒絕保留 `errorName`、`errorOperation` 與經網址遮罩的訊息。`PLAY_NOT_ALLOWED` 是原生播放權限拒絕；`YT_AUTOPLAY_BLOCKED` 來自 YouTube 真正的 `onAutoplayBlocked` 回報。舊的 `AUTOPLAY_NOT_STARTED` 僅代表 4 秒內沒看到 playing，不能單憑它判定網路或權限原因。
- `playback_confirmed` 代表實際位置前進至少 0.25 秒；它可以排除 frozen timeline，但不代表能直接偵測喇叭是否真的有聲音。只有最後一個錯誤之後出現恢復證據，v2 紀錄才顯示 `recovered`。
- 自動重試共用一次 60 秒期限，正常間隔 4 秒。metadata 不算重試成功；有播放意圖時須等位置前進，尚未按播放時則可在 `canplay` 完成準備。手動「立即再試」不延長當輪期限；到期後明確按「再試一次」才開新一輪。重試沿用同一個 media element。
- Mac 探測依「開始」或「失敗」合併進行，同一類別 4 秒內不重複執行，也不新增持續健康檢查。
- 沿用每台成功 100 次、錯誤詳情 30 天的保存方式。排查時先確認診斷版本，依序比較 `visibility_hidden`、`ended`、`next_requested`、下一個 Session 的 source/ready/buffering，以及恢復可見後是否出現 `playback_confirmed`。

### 2026-10-22：鎖屏恢復不再清空音訊緩衝（REG-063）

- iPad 重開後的實測 Session `e29a8194-96b4-4dc0-87eb-eef7a3056d33`：台北時間 22:24:10 系統暫停成功；22:24:12 系統播放觸發舊版重新載入，原有約 684 秒緩衝歸零，接著 `readyState=1`、`pendingPlay=true`、`stalled`，最後回報 `BUFFERING_OVER_8S`。
- 鎖屏／背景收到系統播放時，改為沿用目前音訊，事件為 `native_media_event.state=system_resume_preserve_source`。此路徑不得呼叫 `load()`、重綁來源或重建元素；前景原有修復路徑仍保留，事件為 `system_resume_rebind_source`。
- 不新增健康輪詢，也不修改 YouTube、額度、下一首或紀錄規則。未收到系統按鍵事件不代表已證明 iPad 原生播放程序殘留；仍可能有暫停送出診斷等因素。
- 驗證：`npx playwright test e2e/regressions/lock-screen-resume-buffer.spec.ts e2e/regressions/listen-background-audio.spec.ts`。測試可防止背景重載和進度卡住，不能直接證明喇叭有聲音；部署後仍需實體 iPad 驗證同一操作。
