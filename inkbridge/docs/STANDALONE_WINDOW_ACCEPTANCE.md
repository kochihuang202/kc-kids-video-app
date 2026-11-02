# 新窗口打開：實作與驗收

後續修正：本文件原驗收只涵蓋卡片入口，不能代表白板分頁入口。使用者回報後已重現並補接原23733的 `openStandaloneWindow`；指定白板的真實窗口、編輯及保存證據見 [白板分頁開窗驗收](BOARD_WINDOW_ACCEPTANCE.md)。

2026-11-02；基線 `fe67b00`，分支 `codex/inkbridge-editor-rebuild`。本批只整合獨立 Windows 文字卡片編輯視窗；不整包合併 Gemini，不修改正式 FlexNote、正式資料庫或 Gemini 工作樹。

## 來源與採用範圍

- 原背景模組32573的 `FR/D`：以 `note-card:<cardId>` 重用視窗；960×760、最小560×420、note-detail 路由。保留其行為與尺寸，使用 InkBridge 自有 Electron 生命週期；沒有執行原版 Electron main、帳號、更新或協定註冊，也沒有沿用 `webSecurity:false`。
- 完整75000/73866編輯器及依賴：原 Lexical 內容、文字選取工具列、圖片節點與卡片資訊。新增的保存狀態、草稿恢復按鈕是 InkBridge 的生命週期界面；不是宣稱已把58439完整原版頁面與所有動作整頁移植。
- Gemini `b5fd5bc` 的 dedicated renderer/BrowserWindow 設計有參考價值；其獨立workspace writer、`coordinator.dirty` 判斷、吞保存錯誤後關閉、父視窗先關DB等路徑不採用。沒有搬入其自製 Markdown converter。

## 實際行為

1. 卡片右鍵或更多選單「新窗口打開」建立真正 `BrowserWindow`。同一卡片重用同一視窗，能同時開不同卡片；原生Windows框提供移動、縮放、最小化與關閉。
2. 子視窗有變更時沿用300ms排程自動保存；Ctrl+S／保存按鈕／關閉會明確等待保存，不把300ms當提交成功。組字等待 `compositionend`；沒有用固定延遲代替 flush。
3. 主renderer仍是唯一workspace writer。子視窗送 `cardId + expectedContentRevision + document + requestId`，經主renderer刷新現有編輯器、版本檢查、SQLite COMMIT後回ACK。不同卡片不因共享workspace revision而互相誤判；子視窗不能直接呼叫資料庫commit。
4. 主視窗讀DB期間新到的輸入會在套用子視窗文件前再檢查；保存後文件也需與請求相符。不同內容的過期草稿拒絕覆寫。相同文件重試是no-op，不新增版本。
5. 已保存的更新會通知其他視窗。乾淨編輯器載入最新內容；髒編輯器保留本地草稿。通知早於自己的ACK時，等該次flush完成後再讀，避免漏掉更新。
6. 發生同卡片衝突時，先按「保留草稿並載入最新版本」：草稿以唯一JSON名稱在本機profile的 `Recovery/` 以wx＋fsync另存；確認最新文件可載入後才清除待提交草稿。另存或載入失敗保留原草稿，不自動合併。
7. 關子視窗先等該編輯器及原版檔案貼上工作完成；失敗不銷毀視窗。關主視窗先保存本身、凍結輸入、等所有子視窗ACK、再檢查主writer、關DB及所有視窗。失敗解除凍結並保留全部視窗。關閉防重入，取消後的延遲flush不再凍結界面。
8. 圖片仍是既有SHA-256 CAS獨立原始檔，SQLite只有引用與metadata。IPC僅允許已登記的本機子視窗，保留sandbox/contextIsolation、禁止Node及任意新視窗／跳轉；沒有另建共享正在寫入的DB。

## 檔案與重建

- `src/main/standalone-windows.cjs`：視窗重用、受限RPC、關閉協調、草稿落盤。
- `scripts/original-reuse/standalone-card.{html,mjs}`：完整原編輯器的獨立renderer與content-version協調。
- `src/core/note-version.mjs`：內容比對、版本保護與子視窗服務白名單。
- 現有host/preload/board/original-shell只增加必要邊界；SQLite Schema、白板引擎不改。
- 私人工廠73866貼上命令保留原處理器，補完整FileReader→CAS→Lexical Promise追蹤及await。原factory SHA-256：`368030df73c9d262f0d9ddc448ec086c8532d9d1ca05908ddb2699a64ca1d6d9`；本批前完整可編輯檔：`2b7086f49fc69983c6b0f46264527010b2281986aa09bc25f79f2112f59f689d`；本批後：`896b6152a67a9360b1a7b230885fe6bf52add26a4b21b076154cec1fb4d8fbe5`。範圍不同，原factory hash不等於整檔hash。

已準備私人來源的本機可重建：

```powershell
node inkbridge/scripts/original-reuse/apply-integration-patches.cjs
node inkbridge/scripts/original-reuse/collect.cjs
```

原factory、打包資源、測試圖片、profile及截圖不提交Git。以Git revert本批提交回復自有邊界；私人來源需按保存的原來源與相應patch重建，累積 `.before-inkbridge` 不是本批單步undo。

## 本輪測試結果

只測本批與相關歷史流程，沒有重跑完整Playwright套件。

| 測試 | 實際證據 |
|---|---|
| `check-standalone-windows.cjs` | 真實右鍵原選單、原生Windows handle/獨立視窗、同卡重用、中文Lexical輸入、無變更保存no-op、主子雙向內容、立即關閉保存、多個不同卡片視窗、原文字工具列粗體、重啟保留 |
| 同一專項的圖片測試 | 真實DOM ClipboardEvent→原Lexical檔案貼上→讀檔中立即關閉→重新開啟→CAS bytes相同、img解碼成功；整個應用重啟後再次解碼。剪貼簿事件是合成事件，未改使用者OS剪貼簿 |
| 同一專項的故障注入 | 主renderer RPC拒絕提交時關閉被阻擋；同卡另一份已提交內容不被蓋掉；原草稿另存JSON後載入最新；任一子視窗失敗時父視窗及所有子視窗保留，取消後可繼續操作，再次關閉成功 |
| 同一專項的組字 | 合成composition狀態下flush未提前完成，compositionend後才ACK；不是實體Windows中文IME認證 |
| `note-version.test.mjs` ＋ `persistence.test.mjs` | 9/9；內容版本、冪等、消失卡片拒絕、ACK排空、失敗保留、重疊flush |
| `check-native-backlinks.cjs` | 原生引用新增／刪除／改名、同板焦點、反向引用打開來源、跨板定位、真實編輯及重啟通過 |
| `check-native-groups.cjs` | 群組卡片真實編輯、位置不變、群組拖曳、取消群組及重啟通過 |

私人實測profile：`%TEMP%/inkbridge-original-modules-windows-*`。畫面已檢查 `private-original-editor/standalone-window.png`；頁面截圖不含OS視窗外框，原生視窗由Electron/Windows handle另行驗證。失敗測試攔截錯誤對話框避免阻塞測試，但保留實際關閉拒絕／草稿狀態，不以強制退出冒充保存成功。

## 尚未驗收／限制

- Ctrl+B在子視窗的折疊游標測試未切換格式，原因尚未定位；實際選取文字後按原粗體工具列按鈕保存及重啟已通過。依先前「快捷鍵先不用管」，此項保留待查，沒有刪除產品問題或宣稱快捷鍵全數完成。
- 實體Windows IME、完整所有自訂富文本節點、多視窗長時間壓力／記憶體、子視窗所有標籤／歷史／匯出操作未全面驗收。本批不啟用PDF匯出或心智圖，也沒有擴展OneDrive／帳號功能。
- 主視窗是workspace writer，關閉主視窗會保存並關閉所有獨立編輯視窗；本批不提供「只關主視窗、讓子視窗獨自持續執行」。不自動合併衝突，不自動重開上次的視窗集合。

## 啟動與使用

正常關閉舊版 InkBridge，執行 `inkbridge/Start-InkBridge.bat`，卡片右鍵／更多→「新窗口打開」。資料仍在自己的 `inkbridge/private-original-editor/profiles/desktop`，故障草稿位於其 `Recovery`。測試沒有開啟或改寫這份日常profile。
