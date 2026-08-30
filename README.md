# 小小選片

兒童白名單影音 Web App。Phase 1B 使用 React 19、Vite、TypeScript、Cloudflare Worker 與 D1；孩子端公開瀏覽，家庭裝置授權後才能寫入觀看紀錄與筆記，家長區則使用獨立密碼與 12 小時 Server-side Session。

## 本機開發

```powershell
npm install
npx wrangler d1 migrations apply kc-kids-video-app-db --local
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars` 只供本機使用且已被 Git 忽略。請填入：

- `SESSION_SECRET`
- `PARENT_PASSWORD_HASH`，格式為 `pbkdf2_sha256$iterations$salt$hash`
- `YOUTUBE_API_KEY`

正式 Secrets 可用隱藏輸入 helper 設定，值不會寫入 repo：

```powershell
npm run secrets:setup
```

## 驗證

```powershell
npm test
npm run build
```

測試涵蓋 D1 migration/seed、公開白名單 SQL filtering、YouTube URL 與 ISO duration、PBKDF2、rate limit、未授權裝置 403、Session capability、Heartbeat 冪等、300 秒播放累積、Note、家長 Session/CSRF/logout/password、完整排序、裝置撤銷與台北跨午夜 Dashboard。

## 發布順序

1. `wrangler d1 export kc-kids-video-app-db --remote --output artifacts/backups/<timestamp>.sql`
2. `npm run secrets:setup`
3. `npx wrangler d1 migrations apply kc-kids-video-app-db --remote`
4. `npm run build`
5. `npx wrangler deploy`
6. 在現有 Cloudflare Access 仍開啟時，驗證家長登入、裝置授權、CRUD、Note、Heartbeat 與 Dashboard。
7. 取得最終確認後，只停用 `kc-kids-video-app` 的 Worker-level Access。
8. 驗證公開讀取、未授權寫入 403、未登入家長 API 401、已授權裝置可寫入。

不要取消 Zero Trust 方案，也不要修改 KC AI 教育手記的 Worker、KV 或 R2。

## iPad Safari 實機 checklist

- Portrait 834×1194：首頁、分類、我想說、鍵盤不遮住操作列。
- Landscape 1194×834：播放器、我想說、Today Dashboard。
- 從主畫面啟動後為 standalone 外觀，safe area 正常。
- YouTube iframe 可播放、暫停、seek；返回後停在原位置且不自動播放。
- Dictation 能把語音輸入 textarea。
- 旋轉時播放器與輸入畫面不跳位、不遺失草稿。
- 離線／斷線保存失敗時，草稿仍在本機並可重試。

實體 iPad 結果需由使用者回報；在回報前不視為真機通過。
