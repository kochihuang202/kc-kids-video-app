# InkBridge 0.1.0 / M1 實際驗收

日期：2026-10-30（Asia/Taipei）。本次使用我們自己的 Electron 專案與公開 CanvasKit；沒有啟動 FlexNote、讀取其活動資料庫或接入其程式模組。

## 可執行交付

- 原始碼：`inkbridge/`；`npm ci` → `npm start`。
- 實際 Windows 成品：`release/0.1.0-ca73ff22/InkBridge-win32-x64/InkBridge.exe`，需保留整個資料夾。
- EXE SHA-256：`23ca234e14961d418b3e78833189c13604e4373a272ad4d06ef9188f3db1267c`。
- EXE 外的應用程式原始碼與公開 WASM 亦影響版本，不能只用 EXE hash 判斷是否相同；組件 hash 見 [m1-build-manifest.json](benchmarks/m1-build-manifest.json)。
- 每次封裝使用新 build ID，不覆寫舊成品；`release/last-build.json` 記錄本機最近建置路徑。
- 舊複製版／AppContainer 實驗已停止並私人封存；不在新產品建置依賴或 Git 交付內。

## 測試結果與證據種類

| 類別 | 結果 | 實際驗證內容 |
|---|---|---|
| 自寫模型與幾何 | 5/5 通過 | 負座標往返、游標定點縮放、索引移動更新、500 卡與暴力查詢 oracle、同內容跨板 instance 分離、四種 LOD |
| 真實 Electron 桌面 | 3/3 通過，43.5 秒 | CanvasKit WebGL 首幀；新增中文卡片；選取／拖曳／空格平移／滾輪縮放；移動時 picture 重用；500 卡裁切；low/skeleton 實際切換；36 組量測 |
| 實際封裝 EXE | 2/2 通過，6.9 秒 | 直接啟動最終 InkBridge.exe，重用同一套啟動及新增／拖曳／平移／縮放操作；使用獨立新測試 profile |

桌面驗證由 Playwright 操作真正的 Windows Electron 視窗，不是 browser mock。開發版及成品測試 profile 都不使用 FlexNote 路徑。Renderer 沒有 `require`，開啟 context isolation 與 sandbox；主程序只提供限定資源 protocol 與診斷 IPC，沒有 OS 預設協定註冊或自動更新。

首次實測發現 CanvasKit 0.42 段落樣式未經公開 constructor 正規化會拋錯，造成空白畫面；已修正並要求完成首幀才回報 ready，登錄 REG-073（M2 整理時修正與其他專案重複的 REG-072 編號）。沒有跳過或刪除失敗斷言。

## 首次可重複效能基準

同一台 Windows x64：Ryzen 7 4800HS、16 logical CPUs、約 15.4 GiB RAM。WebGL 上下文實際回報 `ANGLE (AMD Radeon(TM) Graphics, Direct3D11)`；Electron 45.1.0 / Chromium 156.0.8078.49。測試 canvas 1152×683 CSS px、DPR 1。

每個卡數各跑 20%／50%／100% 三種起始縮放，包含 pan／zoom／select／drag，每組 60 個 RAF 樣本，12 warm-up frames 不納入統計。每卡數 12 組、720 樣本，合計 36 組、2160 樣本。場景是獨立文字卡與程序化向量山景，**不是外部圖片／PDF 或完整富文字場景**。

下表是各卡數 12 組測試的「每組統計值範圍」，不是混合後重新計算的單一分位數：

| 卡數 | drawing CPU＋提交 median ms | drawing CPU＋提交 p95 ms | RAF interval p95 ms | observed FPS | Renderer private MiB |
|---:|---:|---:|---:|---:|---:|
| 100 | 1.30–15.50 | 1.90–19.90 | 16.70–16.80 | 59.02–60.01 | 220.08–243.98 |
| 300 | 1.20–16.50 | 1.90–20.60 | 16.80–33.20 | 56.25–60.01 | 241.16–243.68 |
| 500 | 1.30–15.80 | 1.80–24.10 | 16.80–33.30 | 55.39–60.03 | 241.23–249.79 |

- CPU 數值測 draw 到 surface.flush 返回，包含索引、picture miss 排版及繪製提交；不包含 GPU 完成時間，也不包含之後的 sidebar DOM 更新。
- RAF interval 包含實際 callback 間隔；測的是可見 Electron renderer 的程式化操作動畫，不是硬體輸入延遲。
- 最慢一組是 500 卡、50% 附近縮放：CPU median 15.8ms、p95 24.1ms；60 樣本有 3 個 interval 超過 33.34ms。這是已記錄的間歇掉幀，不能宣稱完全無卡頓。
- 可視卡數範圍 12–140（100 卡上限為 100），其餘由索引與裁切排除；picture cache 上限 256 已驗。
- 記憶體包含 Electron renderer 的 private bytes，不只 JS heap；完整各程序數值與 GPU 資訊在 [原始量測 JSON](benchmarks/m1-windows-2026-10-30.json)。目前沒有長時間洩漏測試。
- 沒有本次同場景的 FlexNote 基準，因此**不宣稱效能相同或已接近原版**。未來比較需同硬體、相同可見元素與視窗條件，並另測真實圖片／PDF。

重現：`npm test` 或介面「效能實驗室」；`node scripts/summarize-benchmark.cjs` 讀本機測試輸出。上述量測有場景、驅動與其他程式負載限制，不能當跨硬體保證。

## 完成界線

本輪完成 M1：可操作白板、CanvasKit WebGL、索引／裁切／LOD／有上限 picture cache、實際 Windows executable、自動化與效能基準。內容目前只在記憶體；沒有 SQLite、Lexical、永久保存、快照、OneDrive、真實附件匯入或多視窗同步。M2 才加入自己的資料庫與編輯器保存協定。

## 2026-11-01 原模組整合更新

以上為早期M1歷史量測，並非目前功能狀態。現階段SQLite、原生編輯器、CAS圖片、PDF閱讀與原生側欄／連線等實際驗證，見 [原模組整合驗收](NATIVE_INTEGRATION_ACCEPTANCE.md) 及 [Gemini交付覆核](GEMINI_TOOLBAR_IMAGE_DISPOSITION.md)。本批20項相關資料測試與專項Electron流程通過；未重跑完整套件、效能或EXE封裝，亦未將M1量測套用成現階段效能宣稱。啟動使用 `Start-InkBridge.bat`。

## 2026-11-02 新窗口打開

獨立Windows文字編輯視窗、保存ACK、立即關閉、貼圖與重啟、主子內容同步及保存失敗／衝突草稿保護已實測。9項相關單元測試及native-backlinks/native-groups歷史流程通過；沒有重跑完整套件。測試類型、來源hash與Ctrl+B／實體IME等未驗收項目完整列於 [獨立視窗驗收](STANDALONE_WINDOW_ACCEPTANCE.md)。

使用者補充的白板分頁入口呼叫另一個API，前述驗收漏掉此入口。已真實重現並補接；白板新窗口的操作／保存／衝突、卡片窗口回歸、18項原shell流程與17項相關單元測試見 [白板分頁開窗驗收](BOARD_WINDOW_ACCEPTANCE.md)。

## 2026-11-02 多分頁拖曳與PDF拖入

舊拖曳測試只涵蓋少量分頁；新增18分頁捲動／最大化與Windows實際滑鼠拖動，捕獲並修正越出裁切範圍的no-drag原生區域。PDF拖入漏接原97101 hook，接回後主／額外白板的受信任真實路徑拖入、CAS bytes、原PDF三頁解析及重啟通過；原titlebar與PDF歷史流程亦通過。只跑相關測試，詳見 [來源、修正與驗收界線](WINDOW_DRAG_PDF_DROP_FIX.md)。
