# Regression guardrails

Before changing code, search `docs/REGRESSIONS.md` for bugs related to the files or user flow in scope.

- Run the new feature test and every related historical regression test first.
- Run the complete Playwright suite only for core shared modules or large cross-cutting changes.
- Reuse existing `.spec.ts` flows; do not rediscover the whole website when a maintained test already describes the flow.
- When a historical regression fails, inspect the product code first. Do not delete, skip, or weaken the test to match broken behavior.
- Change a historical expectation only when the user explicitly changes the intended behavior, and record that decision in the regression entry.
- Add a regression entry and the smallest real user-flow test when a confirmed important bug is fixed.

# Cloudflare access SOP

- Before concluding Cloudflare is disconnected or requires a new login, follow `docs/cloudflare-access-sop.md`.
- A sandboxed Wrangler authentication failure is not sufficient evidence that the existing login is unusable. Retry the read-only `wrangler whoami` check with approved full local permissions when configuration, log writes, network access, or token refresh are restricted.
- Never print OAuth tokens, refresh tokens, API tokens, or credential file contents. Authentication checks do not authorize deployment or remote data changes.

# Git sync & commit SOP

### 1. 開始前務必先 Pull
- 在開始任何任務、修改程式碼或讀寫資料庫之前，必須先確認並拉取遠端最新代碼：
  ```
  git pull origin <current-branch>
  ```
- 確保本機工作目錄與遠端倉庫保持最新，避免覆蓋或衝突。

### 2. 完成後務必 Commit 並 Push
- 每次完成功能、修復、資料匯入或任何調整後（且測試通過後），**務必立即主動執行 commit 與 push**：
  ```
  git add -A
  git commit -m "<type>: <short description>"
  git push origin <current-branch>
  ```
- **絕對不要等使用者提醒**。每次任務完成皆須主動提交並推送到 GitHub 遠端。
- 若測試暫時未過，也在 commit message 中註明原因並先行 commit/push，確保進度不遺失。
- 使用常規 commit 前綴：`feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
