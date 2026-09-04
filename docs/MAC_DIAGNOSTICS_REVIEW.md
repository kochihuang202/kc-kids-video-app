# Mac 媒體診斷驗收 Review

檢查目標：`origin/codex/mac-media-diagnostics`，commit `f95632c`。

Windows 已透過正式 App 的媒體資料安全推導 Tailnet origin，成功讀取 `/health`。檢查時服務回傳 `status=ok`、media root readable、Tailscale running/online，且沒有把私人 URL 輸出到文件或 Git。

請 Mac Codex 在原分支補修以下兩項，再執行測試、smoke test、commit 與 push。

## 必須修正 1：保留期限不能依賴 10 MB 輪替

目前 `eventWriter.rotate()` 只有在 active JSONL 達到 10 MB 時才執行舊檔清理。因此低流量家庭環境如果長期不到 10 MB，7 天正常事件與 30 天錯誤事件不會準時刪除。

要求：

- 啟動時至少清理一次。
- 運行中以低頻率定期清理，例如每 6 或 24 小時一次；不能每個事件 WalkDir。
- 正常詳細事件超過 7 天刪除。
- 錯誤詳細事件超過 30 天刪除。
- 128 MB 總容量上限仍保留。
- Active `events.jsonl`／`errors.jsonl` 若可能跨越保留期限，必須按日期輪替，或清理檔案內的過期資料，不能因檔案仍 active 而永久保存舊行。
- 測試必須建立「未達 10 MB 但已過期」的正常與錯誤資料，證明會被清除。

## 必須修正 2：`Server-Timing` 的 first-byte 不能永遠是 0

目前 response writer 在 `WriteHeader()` 送出 Header 時，`FirstByteLatency` 尚未計算；之後在 `Write()` 更新 `Server-Timing` 已太晚，瀏覽器通常收不到更新值。

要求：

- 在第一次送出 Header／Body 之前完成可觀測的 server-side first-write latency 計算並設定 Header。
- `Server-Timing` 至少回傳可信的 `open` 與 `first-byte`（這裡的 first-byte 定義應明確為 server first-write，不宣稱是瀏覽器實際收到網路第一 byte 的時間）。
- JSONL 繼續保留精確 server-side first-write 時間。
- 測試需讀取實際 response header，驗證非固定 `first-byte;dur=0`；用可控制 clock 或注入延遲，避免 flaky sleep assertion。

## 整合方式

不要把 `codex/mac-media-diagnostics` 整支 merge 到 `codex/phase-1b`。該分支基底早於目前 Web App，直接 merge 會顯示大量網站、migration 與 regression test 被刪除。

Mac Codex只需：

1. 在 `codex/mac-media-diagnostics` 補修並推送。
2. 回報新 commit SHA。
3. Windows 端之後只抽取 `mac-media-server/` 與必要文件的 commits／tree，不接受無關網站刪除。

## 補修後回報

- Commit：
- `go test ./...`：
- `./scripts/smoke-test.sh`：
- 未達 10 MB 的期限清理測試：
- 實際 response `Server-Timing` 範例（不得包含私人 URL）：
