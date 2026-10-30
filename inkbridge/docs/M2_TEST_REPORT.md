# InkBridge 0.2.0 / M2 實際驗收

2026-10-30（Asia/Taipei）。保留 M1 tag 與原成品，整合 Gemini 已提交的行內編輯器，再針對重現的缺陷補回歸。產品方向與後續固定流程見 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)，不是把本版簡化功能視為 FlexNote 重製完成。

## 可執行成品

- `release/0.2.0-07d70c58/InkBridge-win32-x64/InkBridge.exe`，保留整個資料夾。
- EXE SHA-256 `2aac4a38149dfaaf422bb7f85724ed51d18f9c8506184b4ef1bdbea5f47149ea`。EXE 相同不表示外部 app source 相同，22 個組件 hash 在 [m2-build-manifest.json](benchmarks/m2-build-manifest.json)。
- 實際 Electron 45.1.0 / Chromium 156.0.8078.49 / Node 24.22.1 / 內建 SQLite 3.53.4，見最新 raw runtime metadata；不是 FlexNote 的 sqlite3 5.1.7 / SQLite 3.44.2。
- `npm ci` → `npm start`；`npm run package:win` 每次建置唯一目錄，`npm run test:package` 測試最近成品。
- 自己的本機 DB `%LOCALAPPDATA%\InkBridge\Workspace\inkbridge.sqlite3`；測試使用臨時根，原版 FlexNote、正式資料、OneDrive 與 token 沒有接入。

## 已實際執行

| 測試類別 | 結果 | 證據邊界 |
|---|---|---|
| 單元／資料層 | **19/19 通過**（最後一輪約 0.65s） | 真實公開 Lexical JSON、模型／索引 oracle、同步與 worker SQLite、回滾、idempotency、過期版本拒絕、獨立 reader 看見 ACK 後內容、並行 Flush 與失敗保留 |
| Electron 桌面 | **12/12 通過**（約 1.1 分鐘） | 新增／選取／拖曳／平移／縮放；文字格式／Undo/Redo；最後中文字符 Ctrl+S；獨立 SQLite reader；正常關閉補存／重開；組字等待；scratch 隔離；快切卡；50/100/150% overlay 邊界；長卡片；逾時恢復；Skia 例外／resize／dispose；36 組 benchmark |
| 新封裝 EXE | **9/9 通過**（18.2s） | 直接啟動上列 EXE，重用啟動／建立拖曳與 7 個 M2 流程，沒有用開發版替代成品驗收 |
| 最新效能矩陣 | **108 組完成**，各 90 幀，另 8 組各 180 幀重測 | 真實 RAF / drawing CPU／query／record／flush，100/300/500、uniform/varied/dense、不同縮放和四種操作；不是 GPU 完成或輸入延遲 |
| 最新 10 分鐘 soak | 執行中；完成後補記 raw 結果 | 不將舊測試或進行中樣本冒充最新版完成結果 |

桌面與封裝測試都是 InkBridge 自己的實際 Electron renderer＋IPC＋worker＋SQLite。只有 timeout fixture 用可控 ACK 延遲及較短失敗 deadline，且 stub native error-dialog 的呈現，交易仍真實完成；不是用固定等待當保存成功。

## 實際修正與防回歸

1. **Invalid JSON value**：公開 Lexical 的 optional undefined 會被 structuredClone 保留，嚴格 DB validator 正確拒絕。編輯器出口改標準 JSON 序列化，不放寬 validator；完整 Chinese／bold JSON 保存、重開都驗證。這是自寫整合邊界問題，不是靠更多原版 REA 才能知道的 API 契約。
2. **卡片切換 race**：同一 close Promise＋edit sequence，避免重複 dispose／過時 open。延遲 real ACK 的真實點卡流程通過。
3. **長卡片幾何**：修前畫面 854、DB 178；render 改同物件後跳過 index 更新。建立／編輯時明確更新 geometry＋index＋transaction，picture/LOD 不再改資料；新測試先失敗後通過。
4. **關閉逾時恢復**：main 送帶 ID 的取消通知，renderer 恢復編輯並拒收舊關閉結果。測試先失敗，修後可保存新文字且晚到 ACK 不關視窗；測試 fixture teardown 獨立於受測逾時流程，避免收尾卡住。
5. **並行 Flush 舊 ACK**：測試用兩個 commit gate 重現第二 caller 在 revision 2 未提交時返回 revision 1。完整 flush 串行後，兩個 caller 均等待最新 commit；保留 failure retry 與最新 draft。
6. **資源／密集 LRU**：例外 finally、明確 GL/GrContext、idempotent dispose、有界 1024 LRU。細節見 [M1_INTEGRATION_REPORT.md](M1_INTEGRATION_REPORT.md)。

歷史回歸登錄於根 `docs/REGRESSIONS.md` REG-073～080；修正原重複 REG-072 編號，沒有改變 PicPick 的既有行為。

## 功能狀態

**已驗證可用**：文字卡建立、單擊行內 Lexical 編輯、基本格式與 Undo/Redo、本機自動提交／Ctrl+S 真實 ACK、正常關閉補存、SQLite 重載、單卡移動與 camera 持久化。內容與 board instance 分離；共享內容／跨板引用在模型與 DB 測試通過，但 UI 尚無多板切換。

**僅有局部證據**：IME 使用 Chromium `Input.imeSetComposition`／`Input.insertText`，證明 active composition 時不發成功 ACK；不是實體 Windows 注音／拼音的完整人工驗收。Overlay 測試證明 bounds 隨 zoom 對齊，不是所有字形、基線、DOM 行距與 Skia 排版 100% 相等。Skia 已支援基本 bold/italic/underline 與系統 Emoji fallback，尚無所有 Lexical block/node 的對照測試。

**已知未達標**：密集 500 卡連續縮放；最新版兩次重測約 32.43–37.76 FPS，72 組中另有一次 466.8ms frame interval。選取／單卡拖曳已免重錄且約 60 FPS。沒有將 M2 前的 47.37 FPS 當作最新版結果；沒有宣稱 0% GPU 或與 FlexNote 效能相同。

**尚未實作／驗收**：原版完整功能、真實圖片/PDF/影音／附件、Mindmap、連線、多選／群拖、可調寬度手柄、多板 UI／多視窗、搜尋、標籤、歷史、匯入、快照、自動 10 分鐘快照、OneDrive 分支載入／還原。Ctrl+S 目前只是本機提交。300ms 是發起 autosave 的排程，不是 ACK 或快照保證。異常終止前尚未提交的 draft 沒有 crash journal；未做斷電／過夜耐久驗收。

## 下一步與證據規則

使用者已請 Gemini 深入程式與 REA 整理功能清單。接清單後逐項核對原版證據、InkBridge 差距、規格與測試；先確認再重製。查不到才記錄缺口並自行補足，不因 demo 方便而換掉原版已確認行為。現有草稿的勾選與「完全一致／60FPS／0 GPU」等敘述不直接當成驗收結論。

M1 基線、私有 REA 與 Gemini 本機歷史保留。產品交付分支只納入自寫原始碼、依賴鎖檔、測試、整理後文件與量測；不把含原版程式片段的新增 Gemini 原始研究 commit 推送到產品分支。
