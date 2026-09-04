# Mac 媒體伺服器診斷交接

## 目的

請 Mac 端 Codex 在現有 Tailscale 私人媒體伺服器上加入完整但低成本的可觀測性。目標不是遠端控制 Mac，而是讓小小選片能判斷播放故障落在哪一層：瀏覽器、Tailscale、Mac HTTP 服務、檔案讀取、Range Request 或媒體傳輸。

這份工作只處理 Mac 媒體伺服器。不要修改 React App、Cloudflare Worker、D1、R2、影片資料或 Git 中的私人媒體清單。

## Git 協作方式

1. 以遠端分支 `origin/codex/phase-1b` 的本文件作為需求來源。
2. 在 Mac 專用分支完成，不要直接推送 `main`。
3. 先檢查並延續既有 `origin/codex/mac-media-server`；若該分支不適合，才建立新的 `codex/mac-media-diagnostics`。
4. 不要覆蓋 Windows 端的未合併改動。
5. 完成後提交、推送，並在本文件底部的「Mac 實作回報」填入分支、commit、啟動方式、測試結果與尚未完成事項。

## 絕對不可進 Git 或 Log 的資料

- Tailscale 私人網址、MagicDNS 完整主機名稱及任何 access token
- Cloudflare、GitHub 或其他 API Key
- Cookie、家庭裝置授權 token、家長密碼
- 完整私人媒體根目錄與使用者家目錄
- 影片／音訊內容

Log 中的媒體識別只使用相對於 media root 的安全化雜湊或 App 傳入的 `videoId`。不得記錄 query string；錯誤 stack 必須移除絕對路徑。

## 1. 快速健康端點

新增：

```http
GET /health
```

要求：

- 不掃描整個媒體庫。
- 正常情況應在 100ms 內由伺服器完成。
- 不需要驗證，但只能透過既有 Tailscale 私人服務存取。
- 支援正式 App Origin 的 CORS，並回應 `OPTIONS`。
- `Cache-Control: no-store`。

回傳契約：

```json
{
  "status": "ok",
  "serviceVersion": "git-short-sha-or-release",
  "serverTime": "2026-09-04T12:00:00+08:00",
  "uptimeSeconds": 86400,
  "mediaRootReadable": true,
  "tailscale": {
    "running": true,
    "backendState": "Running",
    "selfOnline": true
  },
  "system": {
    "awakeSeconds": 7200,
    "lastWakeAt": "2026-09-04T10:00:00+08:00",
    "diskFreeBytes": 1234567890
  },
  "streaming": {
    "activeRequests": 1,
    "activeStreams": 1
  }
}
```

若某一項無法取得，保留欄位並使用 `null`；不要因非核心資訊失敗而讓整個端點回 500。只有媒體根目錄不可讀或服務無法提供媒體時，`status` 才回 `degraded`。

昂貴的 Tailscale CLI、磁碟與系統資訊必須背景快取 30～60 秒，`/health` 不得在每次請求同步啟動多個子程序。

## 2. 深入診斷端點

新增：

```http
GET /diagnostics/deep
```

用途只限播放開始、重試及錯誤後由家庭裝置呼叫，不做輪詢。回傳：

- `/health` 的全部內容
- Tailscale daemon/backend 狀態與本機 Tailnet IP（私人 IP 可以回傳給家庭 App，但不可寫入 Git）
- 最近一次睡眠與喚醒時間
- 媒體 root 的輕量 read/stat probe 結果與耗時
- 磁碟剩餘空間
- 近 5 分鐘 HTTP 摘要：2xx、4xx、5xx、client abort、Range 206、逾時數
- 近 5 分鐘串流摘要：開始、完成、中斷、目前進行中
- 服務 event loop／process uptime（依現有 runtime 能提供的項目）

不得列出 Tailnet 其他成員的名稱、帳號、完整 IP 清單。若要確認特定節點，只回傳匿名 peer count 與最近狀態彙總。

深入診斷應設 3 秒總逾時；個別 probe 失敗要放進 `checks`，不能拖垮端點：

```json
{
  "checks": {
    "tailscale": { "ok": true, "latencyMs": 18, "errorCode": null },
    "mediaRoot": { "ok": true, "latencyMs": 2, "errorCode": null },
    "disk": { "ok": true, "latencyMs": 4, "errorCode": null }
  }
}
```

## 3. 每個媒體請求的診斷 Header

既有 MP3／MP4 回應（含成功、416、404 與 5xx）加入：

```http
X-KC-Request-Id: <random-id>
X-KC-Service-Version: <version>
Server-Timing: open;dur=..., first-byte;dur=...
Accept-Ranges: bytes
Access-Control-Expose-Headers: X-KC-Request-Id, X-KC-Service-Version, Server-Timing, Content-Range, Accept-Ranges
```

要求：

- 若瀏覽器傳入合法 `X-KC-Diagnostic-Id`，Mac Log 保存此 ID 以便和 Cloudflare D1 診斷 Session 對照。
- 不信任或直接寫入任意 Header 文字；ID 僅允許 UUID／限定長度安全字元。
- 正確處理 `HEAD`、單一 byte range、`206`、`Content-Range`、`416`。
- Log 要能區分完整請求、Range Request、client abort、server error 與傳輸完成。
- CORS 只允許正式 App Origin與本機開發 Origin；不要使用帶 credentials 的 `*`。

## 4. 結構化串流事件

Mac 本機以 JSON Lines 或現有 logger 保存事件，至少包含：

```json
{
  "timestamp": "ISO-8601",
  "requestId": "...",
  "diagnosticId": "...",
  "event": "stream_started|first_byte|stream_completed|client_aborted|stream_error",
  "mediaKeyHash": "...",
  "method": "GET",
  "status": 206,
  "rangeStart": 0,
  "rangeEnd": 1048575,
  "bytesPlanned": 1048576,
  "bytesSent": 1048576,
  "openLatencyMs": 2,
  "firstByteLatencyMs": 8,
  "durationMs": 1420,
  "errorCode": null
}
```

禁止逐 chunk 寫 Log。每個 request 最多寫開始、first-byte、結束／錯誤等少量狀態；相同錯誤可在記憶體做 60 秒聚合。

本機保留策略：

- 正常詳細事件最多 7 天或固定檔案大小輪替。
- 錯誤詳細事件最多 30 天。
- 自動壓縮舊檔並設定總容量上限。
- Log 目錄與媒體目錄分開。
- 不提供 Web API 任意下載原始 Log。

中央 D1 的最終保留規則由 Windows／Cloudflare 端另行實作：每台設備成功 100 筆、錯誤詳細一個月、之後只留彙總。

## 5. 睡眠、喚醒與服務存活

Mac 端需記錄：

- 服務啟動與停止
- process crash／未處理例外
- 系統睡眠與喚醒（若 runtime 無法直接訂閱，可保存 uptime discontinuity 推斷，並標記 `inferred`）
- Tailscale backend 從非 Running 恢復的時間
- media root 暫時不可讀及恢復

服務啟動方式應能在：

- Mac 重新開機後自動啟動
- process 異常退出後自動重啟
- 不需要使用者保持 Terminal 視窗開啟

優先延續既有 launchd／服務設定。設定檔可進 Git，但私人路徑、帳號與網址必須用環境變數或本機忽略檔。

## 6. 本機狀態摘要

維護最近 5 分鐘與 1 小時的記憶體／輕量持久化計數：

- request count
- 2xx／206／4xx／5xx
- active request／stream
- completed／aborted／errored stream
- Range Request count
- bytes sent
- 平均與最大 open latency、first-byte latency、request duration
- media root read failure
- Tailscale unavailable count
- service restart count

不得為每次 `/health` 重新掃描原始 Log。

## 7. 錯誤代碼

建立固定、機器可讀的錯誤代碼，至少包含：

- `TAILSCALE_NOT_RUNNING`
- `TAILSCALE_NOT_ONLINE`
- `MEDIA_ROOT_UNREADABLE`
- `MEDIA_NOT_FOUND`
- `INVALID_RANGE`
- `FILE_OPEN_FAILED`
- `FIRST_BYTE_TIMEOUT`
- `STREAM_CLIENT_ABORT`
- `STREAM_IO_ERROR`
- `HEALTH_CHECK_TIMEOUT`
- `INTERNAL_ERROR`

使用固定 code 搭配安全化 message；不要只保存自由文字 exception。

## 8. 測試與驗收

Mac Codex 必須加入自動測試或可重複執行的驗證腳本，至少驗證：

1. `/health` 正常、degraded 與個別資訊 unavailable。
2. `OPTIONS`／CORS 與 expose headers。
3. `HEAD` 不傳 body。
4. 一般 GET。
5. 起始、中段、尾段 Range Request 回 `206` 且 bytes 正確。
6. 無效 Range 回 `416`。
7. 找不到檔案回 `404`，且不洩漏絕對路徑。
8. Client abort 被正確分類，不誤記成 server crash。
9. 同時多個串流的 active count 正確歸零。
10. `/diagnostics/deep` 個別 probe 失敗仍回結構化結果，且總時間不超過 3 秒。
11. Log 輪替、30 天錯誤保留與容量上限。
12. launchd 開機啟動與 crash restart。

另外提供一個不依賴私人檔名的小型 smoke-test 指令，輸出：

- health 結果
- deep diagnostics 結果
- HEAD 結果
- Range 0-1023 結果
- request ID／diagnostic ID 是否能互相對照

## 9. 完成條件

- Mac 媒體服務在重開機後可自行恢復。
- 家庭裝置能從 Tailnet 讀取兩個診斷端點。
- MP3 與 MP4 的一般播放、Seek、iOS 純聽、連續播放不受影響。
- 健康檢查不做高頻 polling，也不顯著增加磁碟或 CPU 負擔。
- 沒有 secret、私人網址、絕對媒體路徑或私人檔名進 Git。
- 已提交並推送 Mac 分支。

## Mac 實作回報

由 Mac Codex 完成後填寫：

- Branch：`codex/mac-media-diagnostics`
- Commit：推送後的 `codex/mac-media-diagnostics` branch HEAD。
- Runtime／主要檔案：`mac-media-server/internal/server/server.go`、`mac-media-server/internal/server/diagnostics.go`、`mac-media-server/internal/server/server_test.go`、`mac-media-server/scripts/smoke-test.sh`、`mac-media-server/.env.example`、`mac-media-server/launchd/io.github.kc-kids-video-app.mac-media-server.plist.example`。
- launchd service：沿用使用者層級 `io.github.kc-kids-video-app.mac-media-server`。本機忽略檔設定 `SERVICE_VERSION`、`DIAGNOSTICS_LOG_DIR`、`TAILSCALE_COMMAND`、`TAILSCALE_SOCKET`；私人 plist 與實際路徑不進 Git。服務已透過 launchd 重新載入與啟動，並保留 crash restart 設定。
- 本機設定步驟：更新本機 `.env` 診斷變數、更新本機 LaunchAgent 環境變數、以 `go build` 重建 `bin/mac-media-server`、重新載入並 kickstart launchd service。診斷 log 目錄與媒體目錄分離，且位於 Git 忽略範圍。
- Smoke test 指令與結果：`./scripts/smoke-test.sh` 通過；驗證 `/health` 200、`/diagnostics/deep` 200、`HEAD` 200、`Range: bytes=0-1023` 回 206 且 1024 bytes，並可用 `X-KC-Diagnostic-Id` 對照本機 JSONL 事件。Tailnet HTTPS 端點透過本機 Tailscale userspace SOCKS 驗證 `/health` 與 `/diagnostics/deep` 均回 200；未把私人 Tailnet URL、IP 或媒體檔名寫入 Git。
- 自動測試結果：`GOCACHE=/private/tmp/kc-kids-go-build go test ./...` 通過。測試涵蓋 `/health` ok/degraded、CORS/expose headers、HEAD、GET、起始/中段/尾段 Range 206、invalid Range 416、找不到檔案/路徑穿越不洩漏絕對路徑、diagnostic headers/log、client abort 分類、active count 歸零、`/diagnostics/deep` 結構化 probe、log 輪替。
- 尚未完成／需要 Windows 端配合：Windows／Cloudflare 端需從瀏覽器播放流程帶入安全 `X-KC-Diagnostic-Id`，並把 request id/service version/server timing 串回 UI 或診斷資料；D1 保留策略仍由 Windows／Cloudflare 端實作。iPad Safari 真機播放、Seek、純聽與連續播放需要使用者端最後驗證；完整重開機後 launchd 自動恢復尚未實際重開機驗證。
