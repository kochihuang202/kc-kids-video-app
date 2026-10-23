# 9/6 播放流程實機對照版

## 目前狀態：已結束對照，恢復退版前播放器（2026-10-23）

使用者回報 iPad 的舊版仍有異常、iPhone 更新至 27 後改善但偶發現象未穩定重現，並明確同意恢復退版前 `d1e3d2a`。`src/KidApp.tsx`、`NativeMediaPlayer.tsx`、`YouTubePlayer.tsx` 完整恢復至該 commit，未加入新播放 workaround；恢復播放區間、系列音量／速度記憶、學習指定次數換集及既有的背景／前景處理。

- 資料庫、觀看紀錄、學會／最愛、下載檔、快取機制與其他工作區內容不變。
- 原本四個對照測試完整保留在 `e2e/archive/playback-september6-baseline.ts`（只增加封存說明，不刪除或放寬 assertion）。它們描述已結束的舊版實驗，不再作為現行產品驗收；所有現行歷史 regression specs 仍正常執行。
- 修正診斷接收缺口：允許 `playback_baseline`、`baseline_metadata_ready`，讓尚未重開的舊 PWA 與本機 pending 批次也能補送。只接受已知事件，不把 metadata 當成恢復，也不變更播放控制或資料保存期限。
- 「更新後有改善」不是 iOS 根因已確認，也不代表恢復現行版能保證鎖屏出聲。後續使用同一裝置、來源與操作判讀診斷，不同時再疊加音訊修法。

恢復驗證結果：42 項現行瀏覽器測試中 41 項通過（包含播放區間、系列設定記憶、指定次數換集、REG-063/064/065、重試上限、下載、YouTube 接續），另 45 項 API／單元及 2 項原生播放器／家長路由 UI 測試通過，production build 成功。`e2e/features/learning-leisure-flow.spec.ts:90` 仍失敗：測試期待「🔒 先從前五部選擇」，畫面已有「🔒 尚未解鎖」且第六部確實不可點。已核對 `d736178` 和 `d1e3d2a` 的分類頁在這段完全相同，不是本次 WatchPage 還原造成；未更改測試、弱化 assertion 或順手改分類頁，因此不宣稱完整 suite 全綠。

以下保留原始對照範圍與當時結果，作為歷史紀錄。

## 目的與版本

2026-10-23 使用者明確要求：暫時把播放規則退回 2026-09-06，先在原本有問題的 iPad 上驗證鎖屏接續下一集。這不是已確認修復，也不是把 9/6 宣稱為最後正常版本。

- 基準：`59bcc15b3cb909b199b98ab6bf061852c54b23ef`，9/6 當天最後一筆 commit。
- 還原前：`d1e3d2a`。後續要回復原先現行流程，可從該 commit 取回相同範圍，不需要 reset、刪除資料或回退整個工作區。
- 範圍：`src/KidApp.tsx` 的完整 `WatchPage`、`src/components/NativeMediaPlayer.tsx`、`src/components/YouTubePlayer.tsx`。
- 現有首頁、分類頁、家長中心、API／Worker、D1 結構與資料、孩子身分與額度、學會／最愛、下載檔、R2 縮圖、Service Worker 及依賴套件不回退。這是舊播放流程搭配現行資料服務的對照，不是重建整套 9/6 執行環境。

## 與原始 9/6 的明確差異

1. 保留純觀察診斷：原生事件、buffer、readyState、實際 currentTime、獨立 Session 與 `playback_baseline` 事件。`getDebugState`、型別相容欄位、callback ref 和記錄事件不介入 play/load/pause 的決策，也不自動恢復或重試播放。舊 metadata 回呼只記為 `baseline_metadata_ready`，不把它當成真的恢復；實際位置前進才記 `playback_confirmed`。
2. 顯示 `9/6 驗證版 · 59bcc15`，主畫面有 `data-playback-baseline="2026-09-06@59bcc15"`。避免誤把未更新的 PWA 當成基準版。
3. 舊錯誤處理外加資源護欄：單一影片的自動重試最多 60 秒，重新嘗試間隔至少 4 秒；metadata 不重設這個外層上限。明確手動重試可在期限後開新輪。這是為了避免重新引入 10/22 已觀察到的每秒多次重載／探測，不影響成功播放與正常換集的舊流程。

`NativeMediaPlayer` 與 9/6 的 diff 只應有上述觀察層；YouTube 播放器只多出診斷用型別／可選讀取介面。不要在本輪加新播放 workaround、AudioSession 設定或無聲循環。

## 暫時採用的舊行為

- 休閒純聽依舊分類順序接續，最後一集回到第一集；同一原生音訊元素切換來源。
- 學習純聽回到單集原生循環。10/6 才加入的「每集 N 次後換集」暫不套用，家長已保存的次數設定不刪除。
- 9/6 之後的影片起訖區間、每系列音量／速度記憶、泉靈乾淨暫停畫面，以及 10/22 新增的背景保留緩衝、一次性前景修復、提早發出換集 play 請求等，暫不套用於這個舊播放頁。其設定、資料與歷史測試仍保留。
- 舊版鎖屏 Pause → Play 會重新綁定來源並 load；本輪不混入 REG-063 的背景分支。

## 驗證與測試

- 新對照流程：`e2e/features/playback-september6-baseline.spec.ts`，涵蓋 Start → 模擬鎖屏 → 結束 → 下一集 → 實際時間前進 → 回第一集、每集 Session、可見版本標記、診斷、學習原生循環、舊版來源重綁與重試資源上限。
- 9/6 相容的既有流程繼續執行；歷史 `.spec.ts` 不刪除、不 skip、不放寬 assertion。
- 後加功能的現行測試（例如指定次數換集、播放區間、系列設定記憶、REG-063/064/065）與這次使用者要求的舊行為不同，不拿來宣稱本輪基準版已全數符合現行功能。恢復現行流程時必須重新執行它們。
- 桌面模擬只能檢查應用程式操作順序與時間前進，不能斷言實體 iPad 喇叭有聲音。

本輪結果：21 項 9/6 相容／對照瀏覽器測試通過，32 項診斷、離線快取、時間統計與多孩子 API 測試通過。既有歷史測試未修改。未將明確暫停的後加功能測試計入通過數。

## 實機操作

1. 先暫停播放；連網開啟 PWA 首頁等候新版快取安裝，關閉後重開。
2. 進入休閒純聽，確認看到 `9/6 驗證版 · 59bcc15`。不要清除網站資料、刪除 PWA 或離線下載。
3. 鎖屏，讓目前一集自然結束，確認下一集是否真的有聲音；另外測鎖屏暫停再播放。
4. 若仍失敗，保留當次 Session；先核對 `playback_baseline`，再比較 hidden、source_changed、loadedmetadata、play_invoked/resolved、buffer 與實際 currentTime。失敗不直接證明是 iOS，也不繼續疊加新修法。
