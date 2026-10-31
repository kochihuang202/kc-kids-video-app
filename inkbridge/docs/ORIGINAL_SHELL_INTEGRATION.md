# 原版清單與縮放整合 — 2026-10-31

本次依使用者較晚確認，**選FlexNote的完整邏輯功能，不把Gemini自製DOM／localStorage類別直接搬回來**。沿用Gemini分支89e721f提供的清單／原模組線索，實際接入已恢復的原元件；不是整包merge該分支。

## 本次接入

| 元件 | 原模組／入口 | 原factory SHA-256 | 接入方式 |
|---|---|---|---|
| 白板清單 | 74582.ListView | 8a136032797a1f1ffe566ea54295f06d8aeb5033d798b29a96696d6f36b0516c | 整個原元件、原Redux、翻譯、圖示與依賴。compact、hideOperation、按name排序使用原props。 |
| 縮放、預設比例與檢視全圖 | 46979.OO | cba922d999fccbb9b3df078b7b7e368262a6785adc15da51b67c2e2d978682f8 | 整個原元件，直接使用原23.wf控制現有原Canvas。 |

這兩個factory的`locallyModified`均為false。沒有以新DOM類別、幾個SVG或參數模仿它們。

`original-shell.mjs`只處理必要邊界：自己的SQLite boards映射到原元件欄位／Redux action；原清單的getFolders回傳真實本機DB清單（目前本機schema沒有folders／board-instances，該兩集合確實為空）；原flow路由轉成InkBridge工作區切換。不是原版資料庫或原Electron main的替代啟動。

58850原服務gateway增加一個明確註冊的委派入口，目前**只接getFolders**；未接服務保持原有行為，不回假成功。原碼patch工具、hash與.before-inkbridge備份沿用既有機制。原版元件與所有依賴留在Git忽略的本機來源目錄；Git只管理接線、patch工具、測試與來源雜湊。

## 保存與切換

點原清單 → 原元件router.push → InkBridge串行導航 → editor.read/組字結束 → SQLite Commit ACK → 關閉舊overlay再flush → 更新原Canvas nodes／viewport與原清單選取。

board/content/instance資料沿用現有SQLite schema；切板不重新建一套Canvas或ShellStore。Viewport保存使用既有白板title，避免視圖操作把名稱寫回固定的「靈感白板」。正常關閉會先等正在執行的導航，再等待保存。

## 本次實測

- 修改前：既有`check-board.cjs`基線通過，原版長文下半部1011個深色像素、雙擊新增、右拖平移、卡片拖曳、組字保存及正常重開。
- 修改後：同一白板回歸通過。
- `check-shell.cjs`使用全新臨時SQLite，兩張白板各有不同文字卡片；真Electron操作原清單與原縮放元件。比例選單70%、zoom-in、fit-view、編輯中直接切板、組字期間切板等待、反覆切板、名稱保留、完整graph正常重開均通過，page errors為空。
- `check-launcher.cjs`實際BAT啟動、原Flow輸入、Ctrl+S、真DB讀回及正常關閉返回0通過。
- 截圖已檢視；本地結果為`private-original-editor/original-shell-result.json`及`original-shell-integrated.png`。沒有全套重測、沒有新效能數據或實體Windows IME結論。

## 明確未接入

- 清單這輪只開啟／切換白板。原右鍵選單同時包含圖示、複製FlexNote連結、刪除等未接服務，因此整個管理入口由宿主明確停用並顯示說明；不留下半接的假操作。清單排序使用原name排序，也關閉需要folder schema的拖曳整理。
- 新增白板、改名、刪除、資料夾、上方分頁、右側列表及其他側欄功能仍未宣稱完成。既有新增卡片與原Flow編輯不受此限制。
- 沒有合入Gemini的私人樣本、24張縮圖、假同步／更新提示、另一套store、舊Canvas或舊編輯器入口。Gemini工作樹未修改。

## 重複執行

已準備好既有私人原始factory的工作區：執行`node scripts/original-reuse/apply-integration-patches.cjs`、`node scripts/original-reuse/collect.cjs`，再雙擊`Start-InkBridge.bat`。本輪沒有封裝EXE。
