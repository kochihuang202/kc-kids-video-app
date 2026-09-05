# 裝置離線下載

## 使用方式

1. iPhone／iPad 先連 Wi-Fi、Tailscale，並確認已經是家庭授權裝置。
2. 開啟 Mac 自架影音的分類，按「下載／繼續下載整個系列」。
3. 下載時保持小小選片在前景。中斷或離頁後，重新按同一按鈕即可繼續；已完成的單部影片不重抓。
4. 從孩子首頁進入「已下載」，可用觀看或純聽播放。
5. 「刪除整個系列下載」只清除目前裝置的檔案，不影響 Mac、分類、學會狀態與觀看紀錄。

YouTube 不提供下載。若某部影片曾屬於下載系列，但裝置檔案已被系統清除，播放器會先詢問是否使用網路串流，不會默默消耗流量。

## 技術設計

- 影音逐塊寫入 Origin Private File System（OPFS），不把整部影片放進記憶體。
- 只有完整寫入、關閉且檔案大小核對成功後才標記完成。
- 分類、影片與授權狀態留下小型本機快照；Service Worker 僅快取應用程式外殼，不快取 API、Cookie 或媒體串流。
- 從「已下載」進入播放器時直接讀取本機快照，不等待網路；其他入口若網路介面仍顯示在線但 API 沒有回應，會在短暫等待後自動使用快照。
- 本機 Blob URL 接回既有 NativeMediaPlayer，因此觀看、純聽、循環與自動接續沿用同一套邏輯。
- 下載及刪除使用 Web Lock，避免兩個分頁同時改寫相同檔案。
- 呼叫持久儲存申請並顯示結果；程式不設定期限、不主動清除，但使用者清除網站資料或作業系統回收儲存空間後仍需重新下載。
- iOS／iPadOS 需要 26 或以上才能使用目前採用的 OPFS 串流寫入能力。

## 維護與驗證

- 主要程式：`src/lib/downloads.ts`
- 畫面：`src/components/Downloads.tsx`
- 離線外殼：`scripts/offline-shell.ts`
- 完整流程測試：`e2e/features/download-series.spec.ts`
- 一般測試：`npx playwright test e2e/features/download-series.spec.ts`
- 含離線重開的 production build 測試：先以 `dist/client` 啟動 preview，再設定 `PLAYWRIGHT_BASE_URL` 與 `PLAYWRIGHT_TEST_OFFLINE_SHELL=1` 執行同一測試。

Mac 媒體伺服器必須允許正式 App Origin 的 CORS，並暴露 `Content-Length`／`Content-Type`。下載時應回傳完整檔案（HTTP 200）；HTTP 206 不會被當成完成檔案。
