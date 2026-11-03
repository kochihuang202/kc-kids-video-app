# 卡片高度與白板原圖尺寸（0.5.5）

使用者確認：白板新貼圖採原始像素寬高；新文字卡片不無限撐長；高度上限可設定；工具列「重設高度」保留寬度與內容，短文貼合、長文內部捲動。手動尺寸保持不變，主動自動高度仍可展開全文。

## 原版依據與修改邊界

沿用現有 1.1.65 私有可讀研究模組，沒有重新跑全套逆向。94700.e 將圖片等比例限制為 600×800、不放大；97101 與 64744 的上傳／貼圖鏈沿用該函式；改為有效尺寸直接返回，異常尺寸 fallback 保留。圖片 CAS 原始檔與卡片內圖片排版不變，不批次修改已貼圖片。

19281.newNoteCardInstance 預設 isAutoHeight=true；59745.K 為完整文字卡片工具列，透過 94700.vz 更新實例；19395/95077 是相關自動高度入口；66597.getNodeBounds 量測內容；10764 固定高度編輯覆層保留原版內部捲動。以自己的 card-height.mjs 適配既有量測結果，沒有新增另一套文字排版引擎。

新卡片 placement 標記 inkbridgeManagedHeight，計算完整內容的原版自然高度，再限制至設定上限；預設832（預設寬520，對應討論比例），可調160–10000世界像素。設定為此電腦的 Profile/device-state.json 偏好，不變動共享內容版本。手動改高度或主動開啟自動高度退出此規則；拖移不退出。重設高度重讀最新設定、等待編輯器／SQLite flush，解除折疊並恢復管理標記，保留寬度與全文。

既有無標記卡片不自動轉換；需按重設高度才採新規則。新上限用於之後建立、編輯中的管理卡片及重設操作，不批次重排整個舊工作區。設定頁顯示520寬的比例預覽。

測試抓到重設時原版 boundsCache 會沿用空白內容量測；自然量測鍵加入原版 getContentIdentity，避免讀取舊高度。自動高度退出時明確清除 managed node 的 isFixedHeight，避免旗標已開、實際仍固定。

## 相關驗證

修改前 check-card-toolbar-menu 通過；修改後再通過原工具列／顏色／高度／折疊／固定／複製／刪除／重開流程。check-empty-new-card 通過即時編輯、空內容與重開。check-settings-frame 通過設定分頁、真實路徑及備份操作，原編輯器空殼預期依本次需求改為高度欄位。

check-card-height 以真實Electron與OS剪貼簿貼100段中文，設定600、卡片高度600、實際scroll容器、完整第100段保存，按原版風格的重設按鈕、明確自動高度展開再重設、1200×900圖片建立等大placement、設定與內容重開保留。手動高度1100透過原版更新服務測試；未將此聲稱為真實拖曳把手驗證。截圖在測試TEMP目錄，已目視檢查長文編輯畫面。

check-real-image-paste 通過真實白板及卡片內Ctrl+V、圖檔解碼、SHA256 CAS去重、圖庫、SQLite及重開。該歷史腳本原本假定空資料庫自帶文字卡，與REG-097衝突；改為明確建立測試卡片，未恢復產品範例資料，未放寬驗收。

未修改正式筆記、原版FlexNote或正式設定；未跑無關全套測試。

## 交付

原始碼提交 c1d3b06。最新隔離長文／圖片驗證 TEMP/inkbridge-original-modules-card-height-AvqYpK；實際 auto-height bounds >600 的斷言通過，重設恢復600。設定驗證 TEMP/inkbridge-original-modules-settings-frame-DWuBi3。其餘相關腳本均通過。

0.5.5（發布序號6）可攜目錄 release/InkBridge-0.5.5-c1d3b06ac801-cb9fd9。針對0.5.0至0.5.4的五份直接增量，全部經Windows PowerShell更新器Stage驗證簽章、ZIP及每檔雜湊，並已複製至既有OneDrive交換根目錄、核對複本。增量約6.05–6.08MB（本次完整原版私有registry因必要尺寸／工具列patch而變動，故以整個檔案更新，不是假稱位元差分）。receipt為私有release/height-delivery.json，releaseId依序12b71897-3fc8-44d2-9c4f-669cfcbb389a、22a1273d-6bff-48d1-ab63-66c787c55fbc、8c02e482-e6b3-4c35-8b55-d559d9ba0df2、eb5f7785-79cb-41c1-958d-49393929ca72、6010c906-3d51-4a1b-8fa7-e5a45cf61417。正式機器尚未代按更新；OneDrive雲端上傳完成不在此驗證範圍。
