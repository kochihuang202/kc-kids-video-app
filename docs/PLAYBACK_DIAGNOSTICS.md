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
