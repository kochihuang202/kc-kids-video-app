# Gemini 五項發現：M1 交叉核對與處置

日期：2026-10-30。原始基線為 `dff2d50`；M1 原始碼、成品與既有量測保留。閱讀 `GEMINI_INDEPENDENT_REA.md`、`GEMINI_CROSSCHECK.md` 後，核對既有私人切片與本次 InkBridge 實測，不重新執行完整 REA、不啟動 FlexNote、不搬用其專有程式碼。

**決策：保留 grid、逐卡 picture 及投影尺寸 LOD；不新增整批靜態／活動快取或 movingPicture。縮放延後重錄已試驗，結果較差，預設關閉。現在導入明確的 Skia 資源所有權、例外釋放與可重入 dispose。**

## 逐項評估

| 發現 | 原 M1 是否等效 | Gemini 證據是否足夠 | 技術差異與目標瓶頸 | 成本／副作用 | 本輪處置 |
|---|---|---|---|---|---|
| RBush R-Tree | 有空間索引、矩形過濾、去重與移動更新；資料結構為自寫 uniform grid | 私人 15166 的節點容量、分割／批建結構及 wrapper `load/search` 支持 RBush 結構判定；不能據此確認精確套件版本或相同性能 | R-tree 適應不同尺寸與稀疏分布；grid 按 cell 索引。可改善查詢與大型元素跨大量 cell 的成本，不能直接改善文字排版或 GPU 提交 | 新依賴、批建／增量更新策略與 oracle 回歸；不代表現有 grid 有正確性問題 | **延後**。本機 500 卡平移 query p99 約 0.2ms、max 0.5ms，未顯示是主要瓶頸；尺寸／密度測試仍須保留 |
| 靜態層＋活動層 | 已有逐卡局部 picture、選取框獨立疊畫；沒有整批 static picture | 66597 明確按 `isStatic` 分到兩個邏輯 layer；不是兩個 DOM canvas 或兩個 WebGL surface 的證據 | FlexNote 可整批重播；InkBridge 重播每張可視卡。前者可能減少 JS→WASM 呼叫，但不會使 GPU 跳過畫面重播 | 失效粒度、z-order、互動分類、內容更新、可視範圍改變與整批重錄更複雜 | **延後**。不能只因已有雙層範例就重寫；先保留 flush／query／record 分段量測 |
| movingPicture | **單卡目標已等效**：局部座標 picture 在拖曳時 translate 重播，不重排正文 | 66597 有 reference ID／原點、moving IDs、群組錄製及位移重播；支持機制存在，不支持「完全消除所有掉幀」 | FlexNote 合併一批移動元素；M1 只有單選。未來群拖可減少多卡提交開銷 | 額外持有 picture、群組成員／內容／尺寸變更時失效、排序及拖曳結束清理 | **不重複實作**。本次 500 卡拖曳實測 paragraph 與 cache miss 都為 0；群選功能出現後再測 |
| 縮放期間重播、延後重錄 | 已重播命中的向量 picture；跨 LOD 或新可視元素仍同步錄製，沒有 gesture 延後策略 | static 的 `isZooming` shortcut、active zoomingPicture 與 wheel 200ms reset 均有源碼支持；沒有零卡頓／固定 60 FPS 證據 | 可降低跨 LOD 的同步錄製尖峰；InkBridge 按投影寬度分級，原版主要按全域 scale。縮放後仍須更新細節 | 可能暫留低細節、漏新可視卡、內容過期，以及將重錄集中到 settle；並非資料保存屏障 | **已試驗，預設關閉**。本機同場景雖消除錄製，CPU／FPS 反而變差，見下表；不因此全面改成原版 LOD |
| CanvasKit／WASM 明確釋放 | M1 已釋放 paragraph、builder、recorder、LRU picture、surface、paint、font manager；例外與重入仍有缺口 | 私人 layer clear/delete、recorder.delete 與 safe-delete helper 支持有明確釋放責任；不能證明整產品零洩漏或推論其歷史事故 | InkBridge 新增 owned-resource tracker、try/finally、idempotent dispose；直接使用公開 WebGL／GrDirectContext／surface API，避免 helper 隱藏 context 所有權或軟體 fallback | 必須區分 owned／borrowed 物件並按依賴順序釋放；不能對 typed array 或純 JS style descriptor 一律 delete | **現在實作**。例外注入、反覆 resize、單一 GL/GrContext、dispose 後 live=0 與重入測試已通過；長時間結果另見總驗收 |

## 掉幀實驗：拒絕沒有量測支持的改寫

同一機器、500 卡、uniform 尺寸、50% 起始縮放，每個操作 180 個 RAF 樣本；是實際 Electron renderer 的程式化操作，不是 GPU 完成時間或硬體輸入延遲。

| 縮放測試 | drawing CPU median / p95 / p99 ms | record p95 / max ms | flush p95 ms | observed FPS |
|---|---:|---:|---:|---:|
| 原策略＋量測 | 13.1 / 18.1 / 19.6 | 0 / 7.1 | 9.0 | 59.99 |
| 延後重錄試驗 | 16.3 / 21.1 / 24.3 | 0 / 0 | 10.1 | 56.25 |

原始資料：[baseline-profile.json](benchmarks/m1-integration/baseline-profile.json)、[deferred-profile.json](benchmarks/m1-integration/deferred-profile.json)。錄製尖峰存在，但不是每幀主成本；消除錄製不等於整幀更快。上述單機對照支持「目前不預設啟用」，不代表所有未來內容／硬體均不適合延後錄製。不得把預設關閉的實驗列為已驗收效能改善。

資源修正、完整卡數／尺寸／密度矩陣與長時間 soak 由本次總測試報告記錄。本文不把進行中的 soak 或短時間 private-bytes 波動當成零洩漏證明；WASM 線性記憶體容量也不等於目前存活配置量。

## 原報告必須修正的證據邊界

- `±100` 是在逆矩陣映射後增加，屬於**世界座標單位**，不是固定螢幕 px。InkBridge 的螢幕 margin 再除以 zoom，兩者不同。
- 明確的 R-tree `drawWithCulling()` 位於 active layer；static `record()` 遍歷所有傳入 static 元素。尚未追完所有上游預篩前，不能宣稱所有離屏卡片都不發起 draw。
- `isStatic` 受互動、動畫、資產載入與 live-render 需求影響，不是永久物件屬性。靜態層也會因內容／版面等變更重錄。
- 「100% 複刻效能」「保證 60 FPS」「完全無卡頓」「CPU/GPU 歸零」都沒有靜態程式碼或本次量測支持。沒有啟動原版 FlexNote 做同場景 runtime 比較，隔離風險仍在；未取得的對照數據不作已完成。
- 200ms timer 是渲染互動 settle，不是 editor flush 或 SQLite Commit ACK。原報告 wheel 約 3440000 的位置不準確；實際 timer 為原 renderer UTF-16 offset 2864393。

## 可重用的私人證據定位

完整 renderer SHA-256：`80f7143aab89e47e0106fa7da4f2733a8f6a640eb285a8f60dc39e707b2522e1`。既有 `flexnote-renderer/module-slices/slice-receipt.json` 與切片 factory hash 已重新核對；不將原版切片提交到 InkBridge。

| 模組 | 原檔範圍與 factory SHA-256 | 關鍵位置 |
|---|---|---|
| 15166 | `[3992108,3998239)`；`df16803aae527c5ff619ca67c0e5b080c38e4f2b18e6411c8ccb08c467facf86` | constructor 3992245；update/load 3997866/3997894；viewport query 3998069 |
| 66597 | `[3533559,3646222)`；`0fb244fe8f46037355834a37788d0700cd1d8e9dc50d873bf9eb6aa7a59426d3` | static 3537534；zoom shortcut 3537611；active 3541999；moving 3542649/3543015；culling 3545734；layer split 3546977 |
| 37757 | 既有 CanvasKit glue 切片 | safe-delete helper 3840251 |

全部 offset 均為零起算、end-exclusive 的 **UTF-16 code units**，不是 bytes；它們支持存在性與分支語義，不能代替 runtime 覆蓋與效能測試。
