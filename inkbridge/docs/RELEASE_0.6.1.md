# InkBridge 0.6.1：白板搜尋

2026-11-12，Asia/Taipei。功能內容與來源見 [BOARD_SEARCH.md](BOARD_SEARCH.md)。
使用者指示直接整合並進版，未經另一輪審查。

## 交付

- 可攜程式基線 commit `7a6ad9361a01`，版本 0.6.1，releaseSequence 17，
  buildId `b56e9c067423b955feb079502a9e3e1b49ea2735e99a20235ddac4bd43519004`。
- ZIP `InkBridge-0.6.1-7a6ad9361a01-84fc9e.zip`，228725044 bytes，
  SHA-256 `de5106ace70dbc9158156e41d25e1959ed6ce926ecafbe397ab79e5a30e460ee`。
- 簽章增量包 0.6.0→0.6.1：`InkBridge-update-d824d8d4-1bf2-4e2f-a0d2-77c1b7befa57`，
  7054372 bytes、9 個檔案。只產生這一條；0.5.14／0.5.15 須先更新到 0.6.0。
- 相對 0.6.0 變更的 runtime 檔案 8 個：本次搜尋（`original-shell.mjs`）以及先前已在
  整合分支、尚未進版的 `0b108ce` 右下角控制列對齊（`board.mjs`、`compact-shell.css`、
  `web-share.mjs`、`register-original.js`、`web-runtime/factories-003.js`），
  加上 `app/package.json` 與使用說明。沒有新增或移除檔案，Electron 45.1.0 不變。
- OneDrive 交換根目錄已放入：完整 ZIP 與 .sha256、`Start-InkBridge-0.6.1.bat/.ps1/.json`、
  `InkBridge-0.6.1-說明.txt`、增量包 ZIP 與描述檔。複製後 ZIP 雜湊相符。
  這是本機 OneDrive 資料夾寫入完成，雲端上傳與另一台下載未確認。
- 後續文件／測試 commit 不改已驗證的 runtime 內容。

## 實際驗證（皆為隔離 TEMP 與合成資料）

- `INKBRIDGE_TEST_BUILD=<0.6.1 目錄> node scripts/original-reuse/check-board-search.cjs`：
  包內 Electron 於原始碼目錄外執行，搜尋全流程與高亮繪製／清除通過。
- `check-portable.cjs`：真實 ZIP 解壓到含中文與空格路徑、2276 檔雜湊、無 Node 的
  BAT 啟動、編輯保存、換程式目錄後重開通過。
- 真實增量包：實際 updater 於 0.6.0 複本上通過簽章／基底／暫存驗證，基底未變。
- 端對端：真實 0.6.0 複本按畫面「更新並重新啟動」，health ACK 後版本為 0.6.1，
  更新前輸入的筆記保留，更新後搜尋按鈕可用並找到該筆記。
- `tests/onedrive-launcher.test.cjs`：0.6.1 啟動器首次安裝、保留筆記、無 ZIP 重用、
  損壞雜湊拒絕通過。
- 原始碼版相關回歸 `check-shell.cjs`、`check-native-resize-lod.cjs` 於合併前通過。

沒有套用到正式安裝，沒有開啟正式筆記。未驗證：另一台實體電腦、深色主題、
Mindmap 節點、實體輸入法、大型白板效能、分享功能在 0.6.1 的重測。

## 測試環境注意

從部分代理／終端環境執行時會帶有 `NoDefaultCurrentDirectoryInExePath=1`，cmd 不會從
目前目錄找批次檔，`check-portable.cjs` 會回報找不到 `Start-InkBridge.bat`。這是測試
行程的環境，不是封裝問題；清除該變數後重跑。使用者雙擊啟動不受影響。

私人收據：`release/search-delivery.json`、`release/search-update-acceptance.json`、
`release/portable-test-result.json`；腳本 `release/deliver-search-0.6.1.cjs`、
`release/accept-search-0.6.1-update.cjs`。
