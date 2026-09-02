# 影片縮圖 → R2 工作流程

這個流程只把縮圖放到 Cloudflare R2；MP4／MP3 仍由 Mac 的私人 Tailscale 媒體服務播放。

## 架構

- R2 bucket：`kc-kids-video-app-assets`
- Worker binding：`MEDIA_ASSETS`
- R2 object key：`thumbnails/<課程代稱>/<video-id>.webp`
- App 圖片網址：`/api/media/thumbnails/<課程代稱>/<video-id>.webp`
- D1 `videos.thumbnail_url` 保存 App 相對網址。
- Worker 讀取 R2 並回傳長效快取標頭；bucket 不需要開放公開 `r2.dev` 網址。

## 一次完成產生、上傳與 D1 更新

先確認 Mac 與 Windows 都登入同一個 Tailscale 帳號，且正式 App API 能回傳該分類的 `mediaUrl`。

專案已安裝 `ffmpeg-static`。腳本會優先使用系統 FFmpeg；找不到時自動改用 `node_modules/ffmpeg-static/ffmpeg.exe`，不需要另外修改 Windows PATH。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-video-thumbnails.ps1 `
  -CategoryId "泉靈的語文課(一上)" `
  -TimestampSeconds 640 `
  -R2Prefix "thumbnails/quanling" `
  -ApplyRemoteD1
```

腳本會依序：

1. 從正式 Content API 取得該分類的自有影片。
2. 用 FFmpeg 在指定秒數擷取一格。
3. 縮放至寬 640px，輸出 WebP（品質 80）。
4. 上傳至 App 專用 R2。
5. 產生 SQL 與 JSON manifest。
6. 有指定 `-ApplyRemoteD1` 時，先完整備份正式 D1，再更新縮圖網址。

每部影片成功上傳後會立即追加 `completed.jsonl`，並原子更新 `progress.json`。工作中斷時重跑相同命令，會跳過已完成項目；FFmpeg 或 R2 暫時失敗會自動重試三次。使用 `-Force` 才會忽略既有進度並重新產生。

大量影片建議降低終端輸出，例如 `-ProgressEvery 50`。AI 只需定期讀取 `progress.json`，不必逐部讀取 FFmpeg 或 Wrangler 的完整輸出。

產物預設放在 `artifacts/r2-thumbnails/`。可用 `-OutputDirectory` 指定其他目錄。

## 每部影片使用不同秒數

建立 JSON，例如 `thumbnail-times.json`：

```json
{
  "quanling-01": 640,
  "quanling-02": 725,
  "quanling-03": 380
}
```

再執行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-video-thumbnails.ps1 `
  -CategoryId "泉靈的語文課(一上)" `
  -TimestampSeconds 640 `
  -TimestampMapPath "thumbnail-times.json" `
  -R2Prefix "thumbnails/quanling" `
  -ApplyRemoteD1
```

JSON 只需列出例外；沒有列出的影片會使用 `-TimestampSeconds`。

## 新增一個 Mac 資料夾

先以私密 Tailscale 網址讀取 `/library`，產生 D1 匯入檔。`LibraryFolder` 只接受 `/media/` 下的一層資料夾；工具只選取該資料夾的直接子檔案，任何子目錄中的 MP4 都會排除。`ExpectedCount` 不符時會直接停止。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/import-local-media-folder.ps1 `
  -MediaServerBaseUrl "https://<private-mac-host>.<tailnet>.ts.net" `
  -LibraryFolder "example-course" `
  -CategoryId "example-course" `
  -CategoryName "Example Course" `
  -VideoIdPrefix "example" `
  -SeriesType "learning" `
  -ExpectedCount 10 `
  -ThumbnailAtSeconds 5 `
  -ApplyRemoteD1
```

匯入 SQL、manifest 與 D1 備份放在被 Git 忽略的 `artifacts/`，避免私人媒體檔名或 Tailscale 網址進入公開 repository。縮圖時間仍由 `publish-video-thumbnails.ps1` 的 `TimestampSeconds` 決定；manifest 中的值用於留下這次匯入的操作紀錄。

## 分階段操作

- 只重新產圖：加上 `-SkipUpload`，不要加 `-ApplyRemoteD1`。
- 已有 WebP，只上傳：加上 `-SkipGenerate`。
- 先產圖與上傳、稍後更新 D1：先不加 `-ApplyRemoteD1`，確認後再執行產物中的 `update-thumbnail-urls.sql`。
- 少量測試：使用 `-Limit 2`；為避免只更新部分資料，`-Limit` 不能與 `-ApplyRemoteD1` 同時使用。

```powershell
npx wrangler d1 execute kc-kids-video-app-db --remote `
  --file artifacts/r2-thumbnails/update-thumbnail-urls.sql
```

## 驗證清單

1. 依 `thumbnail-manifest.json` 逐一讀取 `/api/media/...webp`，應全部回傳 `200 image/webp`。
2. 檢查孩子分類頁與播放器待播封面。
3. 關閉 Mac 的縮圖服務後重新整理，縮圖仍應正常；影片播放仍需要 Mac 在線。
4. 若要回復 D1，使用 `backups/before-thumbnails-*.sql`；R2 圖片可先保留，不影響網站。

## 泉靈課程目前數量

正式 D1 目前匯入 29 部：`01–24、27、29–32`。`25、26、28` 目前不在 `videos`，所以腳本不會替它們產生縮圖；之後若補進 D1，重跑同一命令即可。
