# 心智圖分支外觀與標記

依使用者提供的 XMind 畫面，將原有心智圖改為主題保留外型、一般分支文字加底線、曲線銜接底線；縮短依內容計算的層級間距。這是外觀擴充，沿用原版的布局、互動、Lexical、命中與資料協調器，沒有另換樹引擎。

## 來源與差異

- 已有 FlexNote 1.1.65 私人來源：53861.b 負責量測／繪圖；81958.Oy/jm 初次／動態布局；91413.G7 樹布局；5043 工具列；10764 原生編輯浮層。原生58361只有 none/pill/rounded/sharp，沒有此次要求的底線分支與獨立標記。
- 原始53861來源 SHA-256：289f04d3c8885103f3d92de0615ad47b2596d2bce6e85a5058638bbacd847df2。修改掛點及前後雜湊由既有 integration-patches.json 記錄，私有來源不進 Git。
- 唯讀確認本機 XMind 23.07.180256 的 package 與 theme 資源；有 line-class、line-color、line-width 等獨立主題屬性。整包 REA 因不相關 native-keymap 的封裝完整性不一致未成功；不宣稱已完整逆向或搬用 XMind 引擎。沒有修改其安裝檔或開啟正式 profile，也沒有複製其 SVG／圖示。
- 此次新增繪圖與控制邏輯自行撰寫，圖形是通用幾何。使用者已明確要求改變 FlexNote 原有外觀，並授權實作這些差異。

## 修改位置與契約

- src/core/mindmap-appearance.mjs：量測、標記、底線與樹邊裝飾；原生量測同時供布局／Canvas使用。每個標記22世界座標單位，避免文字與圖示重疊。曲線使用原版 fixed-relative 錨點，子節點靠底線接合。
- mindmap-controls.mjs：沿用原版 Button／Popover；工具列提供「導圖樣式」與「節點標記」。整張導圖或個別節點可選底線分支／框線節點／純文字，個別節點可恢復依導圖設定。
- 標記包含彩色圓點、優先級1–7、任務0/25/50/75/100%、旗幟、星號、書本／想法／愛心／完成。每類最多一個，同類替換，不修改文字內容；可清除全部。
- SQLite原有catalog新增可選欄位：map.inkbridgeStyle；node.inkbridgeNodeStyle與inkbridgeMarkers。沒有Schema遷移。舊導圖未設定時以底線分支顯示，不在開啟時批量改寫節點。derived inkbridgeMapStyle只在呈現資料加入。
- original-mindmaps在同一保存協調器驗證與提交欄位，改標記或樣式後重新布局；文字提交也即時重新量測，保持樹邊與文字一致。既有快照保存完整SQLite，無需另設標記檔。
- WASM：共用一個Paint、一個按需Font、有限的已知SVG Path快取，beforeunload釋放。沒有為每次重畫新增未釋放Paint。沒有宣稱做過長時間記憶體壓力測試。

## 驗證

- check-mindmap-appearance.cjs：真實Electron、獨立SQLite場景、原生左向／雙向布局呼叫、較短間距、底線錨點；點選標記與樣式按鈕、四類標記寬度、帶標記節點文字編輯、整圖／個別樣式、恢復繼承、關閉重開及資料完整保留。節點選取使用維護中的原生store入口，控制按鈕與文字輸入使用Playwright實際互動。
- 已目視檢查 branch-markers、final、restart 截圖，與使用者的文字底線／短曲線參考對照。不是宣稱完整XMind功能或逐像素相同。
- check-drawing-mindmap-menu：與本輪相同新渲染下，筆／螢光筆／橡皮擦、原生新增、Tab／Enter、拖曳、收合、切板、重開通過。
- 相關 drawing-mindmap SQLite／shared-window測試2項及標記契約測試；一般連線回歸另記錄。未重跑無關全套。
- 未驗證：實體中文IME、多媒體心智圖、長時間WASM記憶體、與FlexNote／XMind效能同等。原有新視窗／同步機制沿用，本輪沒有宣稱完成新的跨機實測。

## 0.5.7 實際交付

- 程式提交689bab2，發布序號8；完整可攜目錄：release/InkBridge-0.5.7-689bab2862fc-69cf88，入口Start-InkBridge.bat。
- 實際以此目錄內runtime/electron.exe與app運行check-mindmap-appearance並重開通過；測試資料TEMP/inkbridge-original-modules-map-appearance-nLia5I，已目視檢查restart.png。來源版相關心智圖互動與一般連線亦通過。
- 已為0.5.0–0.5.6七個已交付基底建立直接增量，每包6.05–6.10MB。所有包經實際Windows更新器Stage驗證簽章／逐檔雜湊，再以唯一名稱先ZIP後描述檔寫入既有OneDrive交換根目錄，副本雜湊一致。0.5.6→0.5.7 releaseId：4c2c477c-f72b-4b9e-907e-95b5f43d437e；完整私人收據release/appearance-delivery.json。
- 不修改資料快照、assets或正式profile。沒有代按正式程式的更新按鈕，也不宣稱OneDrive已上傳完成；已到達的更新由既有程式內更新流程處理。
