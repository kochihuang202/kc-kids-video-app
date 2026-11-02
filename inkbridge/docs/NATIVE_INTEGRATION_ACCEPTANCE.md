# 原生介面整合驗收 — 2026-11-01

基線：`ddd8d55`，分支 `codex/inkbridge-editor-rebuild`。本批核對 Gemini `26a2c17` 所列需求；保留可用完整原模組，修正自有 SQLite／路由邊界，不直接接受其「全部通過」宣稱。正式 FlexNote、帳號、正式資料及 OneDrive 未變更。

後續狀態：共用浮層閃動已於61fff45修正；Gemini b5fd5bc的進階功能已另行覆核，單卡Markdown／Word匯出及真實圖片尺寸投影已選擇性接入，見 [進階交付處置](GEMINI_ADVANCED_DISPOSITION.md)。本文件其餘內容保留該批驗收邊界，不表示後續項目永遠未完成。

雙鏈後續完整操作驗收（2026-11-02）見 [BACKLINKS_INTEGRATION_ACCEPTANCE.md](BACKLINKS_INTEGRATION_ACCEPTANCE.md)：補同板／跨板定位、來源往返、區塊與附件引用；前述舊測試只涵蓋建立／查詢／預覽，不能當完整跳轉驗收。

## 本批結果

| 項目 | 原版來源與整合結果 | 實測證據 |
|---|---|---|
| 卡片工具列／選單 | 保留19395、85886、95077；前批已接色票、固定、折疊、複製、移除／刪除、資訊、歷史、標籤、收藏、側欄及原生頁面。本批不重寫或整包重測 | 前批 `GEMINI_TOOLBAR_IMAGE_DISPOSITION.md`；本批 check-shell 回歸 |
| 白板／編輯器貼圖與卡片庫圖片 | 保留64744貼上入口、73866 ImageNode、19281 converter、原生圖片畫廊父元件。卡片庫納入圖片／PDF，圖片搜尋、加入白板、軟刪除／復原均落 SQLite；CAS不刪除 | check-real-image-paste、check-native-library-attachments |
| 左右側欄調寬 | 完整1201左側框架及41右側父元件，沿用原生拖曳、範圍、事件、收合生命週期。每個獨立profile固定localhost origin，使原localStorage寬度可跨啟動保存 | check-native-resize-lod：實際滑鼠拖曳340／520px及重啟 |
| 縮小只顯標題 | 完整48626.i_ hook，包含搜尋時抑制LOD，不再另造閾值 | check-native-resize-lod：0.2→標題、搜尋→內文、關搜尋→標題、1→內文 |
| 提及／反向引用／連線 | 完整34489→96142→89174提及選單、6827節點、64744.nq預覽父元件；自有資料適配原getCardLinks方向與分組。Canvas原生連線手勢、32627工具列與19281轉換 | check-native-mentions：真實輸入`[[`、選取、SQLite AST、反向引用、懸停及重啟。check-native-connections：真實拖曳、跟隨路徑、起點箭頭、顏色、刪線、刪卡連動及重啟 |
| PDF匯入與閱讀 | 原44428批次匯入、96895閱讀器、10764白板PDF、41側欄、89091完整PDF頁面；實際解析頁數，頁碼和偏好走單一Coordinator | check-native-pdf：真三頁PDF、原檔SHA、原生Canvas渲染、跳第3頁、加入白板、側欄、新分頁、即時檔案大小及重啟第3頁 |

此表界定本批完成範圍，不代表全部FlexNote功能已完成。獨立Windows編輯視窗、Markdown／Word／PDF匯出、轉Mindmap根節點仍依先前分工等待後續研究；不以浮窗或選單文字存在冒充完成。

## 本批修正的真實缺陷

- Gemini的左右側欄／LOD示範省略原生父元件、搜尋抑制及啟動origin，改接完整來源。原Canvas已扣右欄寬度，host再縮Canvas會重複扣除；改為與原版一致的右欄覆蓋及原生控制列寬度。
- 連線endpoint必須同白板；刪除卡片實例或連線時，SQLite同交易遞迴清理相依邊，再回載場景，避免資料已刪而畫面殘留。不能把sourceList／targetList方向顛倒。
- 提及測試最初選中了搜尋預覽片段，而非實際目標列；改成實際原生選單選取。懸停使用原DOM的`data-inline-mention-object-id`，未改造成自訂平移事件。
- PDF更多選單的實例`data.id`覆蓋內容ID，與先前NoteCard問題相同；修正87028呼叫順序並獨立傳cardInstanceId。
- 關閉PDF後，原可選dom-to-image預覽仍可能對已卸載／零尺寸DOM產生`data:,`；在原擷取邊界檢查連接／尺寸，發布前拒絕空預覽。這不替代原PDF檔或頁面資料。
- PDF相同頁碼／偏好不新增revision；無效頁碼拒絕且不寫入。新附件metadata更新本機file cache，不必重啟才顯示正確檔案大小。
- 上傳在讀入記憶體前檢查一般檔案與64MiB上限；檔案仍經既有SHA-256 CAS校驗、解碼及不可覆寫發布。PDF不造假圖片尺寸／頁數、不存BLOB。

## 執行過的測試及邊界

本批使用全新temp profile、真SQLite及真Electron。GUI分別執行；沒有重跑整套Playwright、效能或EXE封裝。

| 測試 | 結果 |
|---|---|
| check-native-resize-lod.cjs | 本批先前實測通過；後續未修改該生命週期，不重跑 |
| check-real-image-paste.cjs | 本批先前實測通過，OS剪貼簿Ctrl+V、解碼、原生畫廊、CAS及重啟；後續未重跑整個貼上流程 |
| check-native-library-attachments.cjs | 通過；圖片搜尋／加入白板／軟刪除／原生回收站復原／原檔保留／重啟 |
| check-native-connections.cjs | 通過；建立、工具列樣式、保存、重啟、刪線／刪卡連動 |
| check-native-mentions.cjs | 通過；輸入／插入／懸停／反向引用／重啟 |
| check-native-pdf.cjs | 通過；上述PDF閱讀完整流程，無收集到的JS執行錯誤 |
| check-shell.cjs | 通過；既有18項切板、分頁、縮放、編輯、組字等待及精確重啟 |
| database、original-history、catalog、original-catalog、attachment-store、native-attachments-connections | 20個相關資料測試通過；包含同白板限制、刪除連鎖、無效批次全交易回滾、原檔完整性、PDF no-op ACK |
| apply-integration-patches.cjs重複套用 | 全部already applied，不重複插入 |

局限：PDF標註／高亮寫入、所有PDF工具及所有連線樣式組合尚未全面驗收。原可選PDF縮圖的dom-to-image仍可能記錄擷取失敗警告，未宣稱縮圖生成全面完成；原PDF與頁面閱讀不依賴它。SVG／HEIC等未驗格式不列完成。中文組字仍是協定模擬，不是實體Windows IME認證。未取得新的原版效能對照，不宣稱效能相同。

## 可重複建置與啟動

執行 `inkbridge/Start-InkBridge.bat`。獨立profile位於 `inkbridge/private-original-editor/profiles/desktop`；不以正式FlexNote profile作測試。測試profile均另建temp目錄。若保存失敗，正式應用仍阻擋關閉；測試的強制退出只用於其自己的合成profile。

原版可編輯factory與vendor資源保留在私人目錄，不提交。已準備來源時，依序執行：

```powershell
node inkbridge/scripts/original-reuse/prepare-pdf-assets.cjs
node inkbridge/scripts/original-reuse/apply-integration-patches.cjs
node inkbridge/scripts/original-reuse/collect.cjs
```

PDF.js公開資源為原安裝內的4.4.168；worker、CMaps、standard_fonts及LICENSE均置於私人vendor，記錄檔案雜湊。prepare-pdf-assets不執行原程式，資源不從網際網路載入。腳本新版receipt亦記錄來源ASAR SHA。

## 來源識別

以下是原factory SHA及本機套用後**整個可編輯檔案**SHA，兩者範圍不同，不應當作等長內容比較。完整每步before/after紀錄保留私人integration-patches JSON。

| 模組 | 原factory SHA-256 | 目前可編輯檔SHA-256 |
|---|---|---|
|1201|855a451fefa00ecfc24fe282e85c0d0b18cb498145ceb2ff6aa7cfbabf568093|513848147b087e99bc1eb301ddb620b3aa6fe79fe94708a2fab23345eaa7af43|
|48626|4e77403d2a30f02126c6ec8afd3c0c9b6fe79f3d77df9d59988bb3cc371fc7de|d64da933fd7ccf119b44b09d74443ac73efef6643f921c66385a443e4a08bf53|
|96895|81850a2d1f98fef034dec9f2ffbbeec44abaa89ee11feeb906e47a26b887267a|209fa6d5f8c7da7b3afbe0de4b6f31dd803979c0284090b2b207c3f9979dc18a|
|87028|0084bb11b20d2b290b43efed9c56536080d6081eacbbf67d41a36dae6e458768|e1c410089748aea7b9626db6d4e0a167d2e31fed139a4eb333b1c3ad6cba7b84|

回復本批使用Git revert該批提交；私人工廠依既有`.before-inkbridge`及可重複patch重建，備份是累積patch前來源，並非本輪單步undo。正式使用者資料不因回復程式而刪除。
