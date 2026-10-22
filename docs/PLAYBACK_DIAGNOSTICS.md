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

### 2026-10-22：假播放與解鎖後的一次性恢復（REG-064）

- 新版已生效的 Session `6e34a0b6-a0a0-4b59-a3f7-cf4f4bed7bc4`，台北時間 22:38:35 系統播放保留了約 661 秒緩衝，且回報 `playing`/`play_resolved`，但實際 `currentTime` 凍結於 215.77 秒；22:38:38 解鎖仍未恢復，22:38:41–43 家長在頁面按暫停／播放後才出現 `playback_confirmed`。
- 只在隱藏頁面收到系統播放時安排一次 1.2 秒的實際位置檢查。真正缺資料、正在 seek、已結束或可取得的音訊狀態為 interrupted，不使用這個恢復機制。正常進度會取消檢查。
- 凍結記為 `NATIVE_RESUME_STALLED`，不啟動 Mac／Tailscale 重連。在前景等待狀態穩定後，最多執行一次 `foreground_resume_restart`（同一元素 pause/play），不呼叫 load、不清緩衝。仍失敗時記為 `NATIVE_RESUME_REQUIRES_TAP`，停止並提示「音訊尚未恢復，請點一下播放繼續。」
- 明確暫停、拖曳、頁面播放、換來源、離開頁面會取消待處理檢查；舊 play promise 不得在較新的操作後回報錯誤。這不是持續 polling，背景不反覆強制 play，也不新增健康探測。
- 可取得時附 `audioSessionState`、`audioSessionType`、`systemPlaybackState`、`userActivationActive`。依 [W3C Audio Session 草案](https://www.w3.org/TR/audio-session/) 的狀態語義讀取；僅作診斷，不設定實驗性 AudioSession type、不要求麥克風權限，也不以 active 當成有聲音的證明。
- 仍需實機驗證前景恢復是否獲 iPad 允許；自動化測試不能聽取實體裝置喇叭。若無聲時真正的 media currentTime 持續前進，此機制無法直接識別音訊輸出失效。滑掉 PWA 後仍有聲音的系統層原因也尚未確認。

### 2026-10-22：下一集在背景卡於 0:00（REG-065）

- Session `9a3ad6d7-d23e-47e2-bc8a-e56b3e8a7342`：台北時間 23:24:12 已換成 `ml2-070`，但仍隱藏時 `readyState=1`、緩衝為 0、`play()` 待處理、實際位置為 0；23:24:46 解鎖才出現 canplay/playing，23:24:47 才有實際位置前進。這不同於 REG-064 的「已有完整緩衝、play 已成功，但時間凍結」。
- 改動僅提早註冊原生音訊的自動接續請求：新來源設定完成便呼叫一次 play，不等 metadata；相同待處理 promise 不重複呼叫。不新增來源重載、第二個播放器、下一集媒體預抓或持續健康探測。
- `native_media_event.state=source_autoplay_requested` 表示在 metadata 前提出請求；換集時父子 effect 的先後可能讓該事件落在前一個診斷 Session，應搭配新 Session 的 page_opened、sourceGeneration、readyState、pendingPlay 和 playback_confirmed 比對，不能只看事件名稱判斷成功。
- 驗證：`npx playwright test e2e/regressions/native-listen-source-start.spec.ts e2e/regressions/listen-background-audio.spec.ts`。桌面測試可確認播放請求先於 metadata、兩次換集的實際時間前進與原元素未重建；不能保證 iPad 喇叭或 WebKit 背景下載已恢復。仍需實機鎖屏換集驗收，尚未找到原始回歸的確切版本。
