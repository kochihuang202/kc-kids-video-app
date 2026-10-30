# M1 技術整合與 M2 後續效能驗收

2026-10-30（Asia/Taipei）。基線 tag `inkbridge-m1-dff2d50` 保留；`afa523b` 是明確 Skia 所有權與量測修正。Gemini 自 `0dd4ea5` 至 `a378fbf` 的行內編輯／字型／富文本／高度變更保留，再修正本次發現的資料邊界問題。沒有啟動、修改或重封裝 FlexNote。

## 五項技術決策

完整六面向交叉核對在 [GEMINI_M1_DISPOSITION.md](GEMINI_M1_DISPOSITION.md)。現階段保留自寫 grid、可視區裁切、逐卡 SkPicture 和投影尺寸 LOD。RBush、整批 static/active picture、movingPicture 群組拖曳延後；單卡已有局部座標重播。縮放延後錄製經單機試驗反而較差，預設關閉。明確資源所有權、finally 釋放及 idempotent dispose 現在導入。

真實缺陷是密集場景可視工作集超過舊 256 LRU 上限。先以回歸重現 30 幀錄製 9,600 次，再調整為有界 1024。這是針對已量測工作集的修正，不是照搬原版參數。500 卡之外或更多 LOD 仍可能淘汰，不能宣稱任意場景不重錄。

## 測量方法與版本

- 同機 Ryzen 7 4800HS / 16 logical CPUs / 約 15.4 GiB RAM / Windows build 26200，CanvasKit WebGL2，ANGLE AMD Radeon Direct3D11。GPU 名稱以實際 WebGL renderer 為準，Electron basic GPU info 不是完整利用率證據。
- 真實 Electron 視窗、程式化 RAF 操作。drawing CPU 是 JS/WASM 繪圖與提交時間，不含全部 UI callback，`flush` 也不是 GPU 完成時間；RAF interval 包含排程／GC／系統干擾。FPS 是該段平均，不等於所有單幀平順。
- `m2-final-uniform.json`：100/300/500 × 20/50/100% × 平移/縮放/選取/拖曳，共 36 組，每組 90 幀。
- `m2-final-all-sizes.json`：100/300/500 × varied/dense × 25/50/100% × 四種操作，共 72 組，每組 90 幀。Varied 含 850×600 大卡，dense 為重疊密集排列；文字＋程序化向量卡，**沒有真正圖片解碼或 PDF**。
- `m2-dense-recheck-1/2.json`：500/dense/50%，四種操作，各 180 幀，兩次獨立依序重測。沒有同時執行另一套 InkBridge 壓測／soak；一般 Windows 背景工作仍存在。
- 最新 raw report 附版本、runtime、主要 source SHA-256；HEAD 可能包含測試時尚未 commit 的補丁，以檔案 hash 為準。之後的修改只涉及保存／關閉協定，CanvasEngine 測量版本相同。
- `resource-fix-profile.json`、`final-matrix.json`、`varied-density.json` 是早期與 soak 重疊的 contention 壓力數據，檔內已註明；不用它們作公平前後比較。

## 標準尺寸：最新版

下列為各卡數 12 組的範圍，p99 是每組自身 p99 的範圍；90 樣本時 p99 幾乎等於最大值，不宜解讀成大型分布。

| 卡數 | RAF p95 ms | RAF p99 ms | FPS | drawing CPU p95 ms | renderer private MiB | Electron CPU 原始 % |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 16.8–33.4 | 16.8–66.6 | 49.09–60.00 | 2.1–29.4 | 246.2–279.5 | 1.51–5.87 |
| 300 | 16.8–16.9 | 16.8–33.2 | 59.34–60.00 | 2.1–19.8 | 277.8–282.9 | 1.27–5.14 |
| 500 | 16.8 | 16.8–33.3 | 59.34–60.00 | 2.3–20.7 | 280.3–285.3 | 1.39–5.17 |

CPU 是 Electron `percentCPUUsage` 原值，沒有換算成單核心占用或視為整機 CPU；memory 原始單位 KiB，表內轉成 MiB。M2 同時載入 regular/bold/Emoji 系統字型，memory 高於原 M1，沒有把這個差異藏在基線內。

## 密集 500 卡：改善與未完成部分

| 測量版本 / 50% | 平移 FPS | 縮放 FPS | 選取 FPS | 單卡拖曳 FPS |
|---|---:|---:|---:|---:|
| 舊 256 cache、M2 編輯 UI 前 | 35.06 | 21.95 | 17.88 | 17.20 |
| 1024 cache、M2 編輯 UI 前 | 60.00 | 47.37 | 60.00 | 60.00 |
| 最新 M2，72 組矩陣中的一次 | 51.43 | 25.47 | 60.00 | 60.00 |
| 最新 M2，兩次 180 幀重測範圍 | 56.84–59.67 | 32.43–37.76 | 59.34–60.00 | 60.00 |

最新兩次縮放 FPS 中位數 35.10；drawing CPU p95 為 36.1–46.8ms，p99 為 43.4–52.3ms；RAF p95 33.5–50.1ms、p99 50.1–50.2ms。每次 zoom 共 380 picture miss，drag/select 都是 0 miss / 0 paragraph build。歷史拖曳則是 28,800 miss / 81,630 paragraph build。

72 組的密集 500 卡縮放有一次 **466.8ms RAF interval**，原始資料保留，沒有剔除。當組 query p99 0.5ms、record p99 90.5ms、flush p99 24.6ms，drawing p99 130.4ms；因此已知昂貴重錄／提交，另有未歸因的排程停頓，不能將整個 466.8ms 都歸給同一段程式。兩次重測沒有重現同等長停頓，但持續縮放仍慢。

目前沒有單一受控實驗能把 M2 前後差距歸因到字型、富文本或系統負載中的某一項，不能宣稱 Gemini 的某項變更單獨造成退化。**密集連續縮放尚未達流暢度目標**；下一輪應以這個真實場景做 profiler，再比較只重用兼容 LOD picture、錄製成本與 GPU 提交，保留最新版功能，不直接重寫成雙層引擎。

Varied/dense 72 組每組完整 p95/p99/CPU/memory 均在 raw 檔。所有組 `geometryChanged=false`，避免繪圖把壓測尺寸偷偷改掉。M2 的文字量測放在建立／編輯，Canvas replay 不修改資料。

## 資源與耐久

自動化實際注入排版例外、16 次 resize、兩次 dispose：一個 GL/GrContext，結束後所有 owned WASM 物件為 0，沒有 delete 錯誤。Typed array、style descriptor 與 borrowed Canvas 不當作 owned delete。

舊 `soak-cache1024.json` 跑 615.956 秒、34 樣本：renderer private 209.06–214.42 MiB，first 211.32 / last 210.83，WASM capacity 128MiB；84,768 pictures、117,623 paragraph/builder 均已對應 delete，GL=0。這是 Gemini 後續富文本／多字型變更前的測量，**不冒充最新版 soak**。

最新版另以 `m2-final-soak.json` 記錄；結果見 [M2_TEST_REPORT.md](M2_TEST_REPORT.md)。每輪量測 pre-GC/private bytes、明確 CDP GC 後 JS heap、owned ledger、GPU cache、WASM capacity。GC 用來觀察 retained memory，不代表真實使用時自動 GC 的時機；10 分鐘有界測試不是所有記憶體洩漏的證明，也不是過夜耐久驗收。

## 未取得的對照

沒有取得同機同場景 FlexNote runtime FPS/CPU/memory。未為對照啟動可能接觸正式 profile 的原版，私人靜態 REA 僅支持機制存在。未測真實 PDF／圖片解碼、巨大長文、跨視窗和實體滑鼠輸入延遲；不宣稱達到 FlexNote 相同性能或 GPU 0%。

## 重跑

```powershell
npm test
node scripts/run-acceptance.cjs new-uniform
node scripts/run-acceptance.cjs new-sizes all-sizes
node scripts/run-acceptance.cjs new-dense dense-focus
node scripts/run-soak.cjs 600 new-soak
node scripts/summarize-acceptance.cjs new-uniform new-sizes new-dense new-soak
```

效能命令依序執行，不與另一個壓測同時啟動；功能測試與效能報告分開解讀。
