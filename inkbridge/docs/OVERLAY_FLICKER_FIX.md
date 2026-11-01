# 共用浮層單幀閃動 — 2026-11-01

基線 `9ec7d95`。使用者指出卡片更多選單、自動高度提示、側欄編輯分組提示及匯出子選單都會閃一下。本批先重現共用機制，再修改原版來源的一個動畫交接點；未改寫各個UI、未關閉動畫或GPU、未更動保存規則。

## 重現與原版來源

- 新建隔離合成工作區，對原生Tooltip／Popover逐requestAnimationFrame記錄DOM身分、位置、尺寸、透明度。舊碼的提示框在第30個採樣frame由opacity `0.99812` 倒退為 `0`；其他探針亦觀察到更多選單寬度由約256退回204.8，再於下一幀復原。
- 閃動當下DOM身分相同；非保存交易造成remount。單純定位更新也無法解釋opacity和scale同時退回初始值。
- 原版58432 Tooltip／Popover使用Motion lazy feature98410；其加速動畫在93204，動態值及scheduler在37554，VisualElement渲染在81889。原版MotionValue版本標記12.6.5。
- 93204的WAAPI `onfinish` 原順序：`motionValue.set(final)`排入下次render，接著立刻`cancel()`釋放WAAPI fill。原81889的`scheduleRender`是排程，並非同步套用DOM；交接空隙露出原initial inline style，下一幀才寫最終值。
- 隔離診斷曾只將原引擎的加速supports改為false作單變因比較；主選單未再出現縮放倒退。此實驗不納入產品；產品保留原WAAPI路徑。

## 最小修正

93204在設定最終MotionValue後，透過既有`motionValue.owner.render()`同步套用最終樣式，才呼叫原完成回呼及cancel。保留原duration、easing、進退場、原生定位和取消／中斷分支，不引入另一套動畫。

自有可重複patch位於`apply-integration-patches.cjs`；私人factory不提交。原factory SHA-256：`705031b2db3848941e43bdbdd1fdc6464662ae47c0051a19c867e9deddd965aa`。整個可編輯檔案修改前：`399627c7c238b7c9fdea90fb635e3b3450deef0012d957e572a4fadea08a42f6`；修改後：`8f69a94ee47856a9155b24e286609a77af3e1631363c78b9a6cc02c6d9c9145b`。factory與整檔hash範圍不同。

## 驗證

`node inkbridge/scripts/original-reuse/check-overlay-stability.cjs`

- 修正前先失敗：`card-tooltip: opacity reset ... 0.99812 -> 0`。
- 修正後實際Electron通過：卡片Tooltip、自動高度Tooltip、側欄編輯分組Tooltip、更多主選單、匯出子選單。每個入口記錄70個rAF的觀察區間；可見樣本52／67／66／67／66幀，五者DOM身分均維持一個，最後opacity1，沒有入場動畫倒退。
- 該測試檢查真正的原生DOM及逐幀狀態，不以「選單存在」或「資料保存成功」代替閃動驗證。樣本保留私人`overlay-stability-samples.json`；未宣稱所有可能UI或GPU像素閃爍均已窮盡驗證。
- 直接相關的工具列回歸使用`INKBRIDGE_TEST_STOP_BEFORE_CLIPBOARD=1`執行check-card-toolbar-menu：36色、點色保存與重啟、高亮頭部、自動高度、折疊、固定全部通過。沒有重跑剪貼簿、PDF、全套Playwright或效能測試。
- 新增逐幀測試可避免未來只看最終畫面而漏掉動畫交接的一幀；不需要為此重寫UI架構。

## 本輪測試啟動錯誤視窗

最初診斷腳本把temp資料夾命名為`inkbridge-flicker-*`，不符合host只接受`inkbridge-original-modules-*`或私人profiles的白名單，啟動被擋下。這是本輪測試的錯誤，非使用者筆記毀損；錯誤發生在建立資料庫／Electron profile前。

已改正測試路徑，核對並移除父程序已退出、帶Playwright inspect參數的殘留測試程序樹94424，保留正常使用者程序94792。另將白名單拒絕改成stderr訊息＋exit1，避免以未捕捉例外留下主程序錯誤視窗；沒有放寬白名單。

`node --test inkbridge/tests/original-profile-startup.test.cjs`實際啟動Electron，驗證無效profile於期限內exit1、不建立目錄或資料庫，通過。

## 生效與回復

已開著的InkBridge仍載入舊registry；正常保存並關閉後，使用`Start-InkBridge.bat`重新開啟才載入修正。本輪沒有強制關閉正常使用者視窗。

重建仍依序套apply-integration-patches及collect；新增步驟可重複套用。回復以Git revert本批提交、再依私人備份及patch重建registry；不刪除任何使用者工作區。
