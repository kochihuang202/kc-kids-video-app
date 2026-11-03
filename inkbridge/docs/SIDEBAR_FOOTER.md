# 底欄依 FlexNote 配置調整（0.5.3）

使用者明確取消底欄保存按鈕、本機／快照版本數字與「已保存」常駐文字；新增軟體版本號，滑鼠停在燈號顯示備份時間，回收站依原版放進選單，設定按鈕尺寸對齊原版。原保存觸發與資料格式不變。

## 原版查證與適配

沿用目前私人 registry 的完整原碼，不重新完整逆向。`1201` sidebar 容器交給 `78507.Tj`；`78507` 底欄把回收站放在使用者／應用選單，路由到語系下的 `/trash`，不是獨立佔住底欄文字。底欄 icon button 使用 `w-7 h-7 min-w-0 p-0`，設定圖示 `w-3.5 h-3.5`、strokeWidth 1.75，圓角 rounded-lg。狀態使用原版 `58432.e` Tooltip，foreground、sm、closeDelay 0，內容分狀態與 lastBackup 兩行。

InkBridge 不導入已排除的帳號／登入服務；以版本標籤替代原帳號標籤，保留同樣「左側選單入口、右側小型狀態與設定」關係。使用既有原版 Button17015、Popover41278／16938／48933、Tooltip58432、設定38330與回收站54129圖示。回收站呼叫既有原版 TrashView 路由，設定仍開既有真實儲存與同步設定，沒有製作假選單動作。

`sidebar-footer.mjs` 是邊界 glue；由原 shell provider 內 portal 渲染，避免另起沒有原版 context 的 React root。既有內部保存／路由 DOM hooks 隱藏保留以免破壞 Ctrl+S、生命週期和原設定開啟流程，不再當作可見 UI。info IPC 改讀真正 package.json.version，開發版與可攜版都不顯示 private-porting 假版本。

## 測試

沿用 check-save-indicator，增加：版本文字來自 package、舊底欄 hooks 不可見、燈號無內文、設定和燈號 hit target 28×28 px、真實滑鼠 hover 顯示最後備份與日期、實際點設定開啟真實 dialog、版本選單點回收站進入原版 trash 頁面。原有主／子視窗紅綠狀態、離線待送與恢復、無成功 toast、正常關閉一起通過。

已保存並目視檢查隔離截圖 `TEMP/inkbridge-original-modules-save-light-890Ux8/footer.png`：版本靠左、狀態和齒輪靠右、黑色原版 tooltip 顯示備份時間；截圖為發布版本號提升前，當時顯示 0.5.2。這不是原版執行期全功能／所有設定頁的等效驗收，沒有重跑無關套件。

## 交付

0.5.3／發布序號 4 已針對三個已交付基底產生直接升級包並放進指定 OneDrive 根目錄：0.5.0 與 0.5.1 各 155,062 bytes／12 個檔案，0.5.2 為 132,661 bytes／8 個檔案。三份皆通過實際 Windows helper Stage 簽章／檔案驗證及複製內容核對。releaseId 依序為 202eb3d6-7bd1-41d6-87bb-00b9281cf89c、39c45112-a0df-408d-a532-a335f69fdf4d、a263585b-2920-413b-8154-f8b245f2206d。私人發布紀錄為 release/footer-delivery.json，不提交封裝或私鑰。
