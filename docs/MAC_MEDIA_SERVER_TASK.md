# 小小選片：Mac 私人影音伺服器任務

## 先讀這裡

這份文件提供給 Mac 上的 Codex。開始前請先讀取 Repository 根目錄的 `AGENTS.md`，並遵守責任邊界。

GitHub Repository：

`https://github.com/kochihuang202/kc-kids-video-app.git`

任務規格分支：

`codex/mac-media-server-spec`

請從此分支建立自己的實作分支：

`codex/mac-media-server`

現有正式 Web App：

`https://kc-kids-video-app.ji3cp31p4.workers.dev`

這個 Repository 是公開的。所有提交內容都必須移除家庭網路與主機的真實識別資訊。

## 背景與目標

小小選片目前使用 React、Vite、Cloudflare Worker、D1 與 YouTube IFrame Player。Windows 端繼續負責 Web App。Mac 的唯一任務是成為家庭私人 MP4／MP3影音主機。

目標資料流：

```text
Mac 或外接硬碟上的離線 MP4／MP3
  -> localhost read-only media server
  -> Tailscale Serve HTTPS
  -> 已加入同一 tailnet 的 iPad／iPhone／Windows
  -> 小小選片原生 <video>／<audio>
```

第一版只使用一個 Tailscale 帳號，不建立額外家庭帳號，不使用 Funnel，也不公開影音主機。

如果來源位於 Google Drive for desktop，檔案必須已鏡像或設為離線可用。不能依賴播放時才臨時下載的雲端檔案。

## 工作邊界

Mac Codex可以新增或修改：

- `mac-media-server/**`
- `docs/MAC_SERVER_HANDOFF.md`
- 與 Mac Server直接相關且經使用者確認的文件

除非使用者另外明確授權，不得修改：

- React／Vite 前端
- Cloudflare Worker
- D1 schema 或 migration
- `wrangler.jsonc`
- 現有 YouTube 播放器
- Cloudflare Access、DNS 或部署

不得上傳影音檔案、憑證、Token、Cookie、私鑰、真實 `.env` 或 Google 登入資料。

## 執行順序

### 1. 唯讀環境盤點

先回報以下結果，不要立即安裝或修改系統：

- macOS 版本與 Apple Silicon／Intel。
- Tailscale 是否安裝、版本、登入與連線狀態。
- MagicDNS、HTTPS、Tailscale Serve 是否可用。
- 適合的 localhost Port。
- 預計影音根目錄、磁碟空間、外接硬碟掛載狀態。
- Google Drive for desktop 是否存在，影音檔案是否真正離線。
- Go、Caddy、ffprobe 等可用工具。
- Mac 睡眠與重開機後可能影響服務的條件。

不得把真實 hostname、tailnet 名稱、路徑或身分資訊提交到公開 Git。回報給使用者時也不要輸出任何 auth key。

遇到安裝、`sudo`、Tailscale 登入、啟用 HTTPS、launchd 或 macOS 設定變更時，先說明影響並取得使用者確認。

### 2. 選定單一 Server方案

以簡單、穩定、低維護為優先。優先使用成熟且可測試的 HTTP server；若自行實作，優先考慮 Go 標準函式庫並提供完整自動測試。

Server 預設只監聽：

`127.0.0.1:8080`

影音根目錄必須透過設定提供，例如：

`MEDIA_ROOT=/path/to/offline/media`

不得將 Mac 真實路徑寫死在程式核心。

### 3. 實作 Endpoint

#### `GET /health`

成功範例：

```json
{
  "status": "ok",
  "mediaRootAvailable": true,
  "serverTime": "2026-01-01T00:00:00Z"
}
```

影音根目錄不存在時不可 crash；回傳清楚且可被前端辨識的錯誤狀態。

#### `GET|HEAD /media/{relativePath}`

必須支援：

- MP4：`video/mp4`
- MP3：`audio/mpeg`
- 大型檔案 Direct Play
- HEAD Request
- HTTP Range Request
- 合法 Range 回傳 `206 Partial Content`
- `Accept-Ranges: bytes`
- 正確 `Content-Range`、`Content-Length`、`Content-Type`
- 無效 Range 回傳 `416`
- 找不到檔案回傳 `404`
- 播放、暫停、Seek及從中間開始載入

必須拒絕 directory traversal、MEDIA_ROOT 外部檔案、directory listing，以及所有 upload／delete／rename／modify 方法。

#### `GET /library`

回傳唯讀清單，供 Windows 端未來批次匯入：

```json
{
  "generatedAt": "2026-01-01T00:00:00Z",
  "items": [
    {
      "path": "/media/science/example.mp4",
      "name": "example.mp4",
      "mediaType": "video",
      "mimeType": "video/mp4",
      "sizeBytes": 123456,
      "modifiedAt": "2026-01-01T00:00:00Z",
      "durationSeconds": 600
    }
  ]
}
```

要求：

- 不洩漏實體磁碟路徑。
- `path` 是穩定、URL encoded 的相對網址。
- 只列出允許的影音副檔名。
- `durationSeconds` 取得不到時可為 `null`。
- 單一損壞檔案不可讓整個清單失敗。

### 4. CORS

正式 Origin：

`https://kc-kids-video-app.ji3cp31p4.workers.dev`

允許 Origin 必須由設定提供，不在核心程式碼中寫死，也不得使用 `*`。

至少處理 `GET`、`HEAD`、`OPTIONS` 與 `Range`，並視需求暴露：

- `Accept-Ranges`
- `Content-Range`
- `Content-Length`
- `Content-Type`

Cloudflare Worker不在私人 tailnet，無法直接檢查 Mac；`/health` 和 `/library` 是由已安裝 Tailscale 的瀏覽器呼叫。

### 5. Tailscale Serve

將 localhost Server透過 Tailscale Serve reverse proxy 提供 HTTPS：

```text
http://127.0.0.1:8080
  -> Tailscale Serve
  -> https://<mac-host>.<tailnet>.ts.net
```

要求：

- 只在 tailnet 內可達。
- 不使用 Funnel。
- 不做 Router Port Forwarding。
- 不建立 Public Tunnel。
- 不直接由 macOS Tailscale App 分享資料夾；只 reverse proxy localhost Port。

公開文件只能使用上述 placeholder，不得提交真實 URL。

### 6. 自動啟動與失敗處理

使用適合 macOS 的 launchd 方式讓 Local Server可在重開機後恢復。提供 start、stop、restart、status及 log 操作。

必須處理：

- Mac 關機或睡眠。
- 家庭網路中斷。
- Tailscale 未連線。
- Server 停止。
- 外接硬碟未掛載。
- MEDIA_ROOT 不存在。
- 檔案不存在。
- Range 錯誤。

不要未經確認自行修改 Mac 睡眠設定。

### 7. 媒體相容性

第一版不做 transcoding。若 ffprobe 可用，提供唯讀檢查腳本並回報 container、video codec、audio codec、duration、resolution與 bitrate。

iPad Safari優先格式：

- MP4：H.264＋AAC
- MP3：標準 MPEG Audio

不相容檔案只列出，不修改或覆蓋原始檔案。

### 8. 自動測試

至少測試：

- `/health` 回傳 200 JSON。
- MP4／MP3普通 GET與正確 MIME。
- HEAD不傳完整內容。
- `Range: bytes=0-1023` 回傳 206和正確 headers。
- 無效 Range回傳 416。
- Seek及從中間載入。
- traversal與 MEDIA_ROOT 外部路徑被拒絕。
- 非唯讀 HTTP method被拒絕。
- 正式 Origin CORS成功，未允許 Origin不取得權限。
- Tailscale HTTPS可由同一 tailnet 的另一台裝置存取。
- 未加入 tailnet 的裝置不能存取。

如果沒有實際操作 iPad，必須標記為「待使用者實機驗證」，不得宣稱通過。

## Git 協作流程

1. Clone此 Repository。
2. Checkout `codex/mac-media-server-spec`。
3. 建立 `codex/mac-media-server`。
4. 只修改允許的 Mac scope。
5. 持續更新 `docs/MAC_SERVER_HANDOFF.md`。
6. 本機驗證後提交實作分支。
7. Push 前回報測試結果與預計提交檔案，取得使用者確認。
8. Push後建立 Pull Request，不直接 merge main。
9. 問題與回覆放在該 Pull Request或專用 GitHub Issue；不得貼入 secrets。

## 完成定義

只有以下項目都有證據，才可宣稱 Mac Server完成：

- Local Server可啟動與停止。
- MP4／MP3 Range播放正常。
- `/health`、`/library`、`/media` 正常。
- MIME、HEAD、206、416正確。
- Traversal與寫入被阻擋。
- CORS正確。
- Tailscale Serve HTTPS正常且未公開。
- launchd與操作文件完成。
- 自動測試通過。
- `docs/MAC_SERVER_HANDOFF.md` 已依模板完成。
- 未執行的 iPad測試有清楚標記。

第一個回覆只做環境盤點、風險與單一建議方案；不要立即安裝或修改系統。

