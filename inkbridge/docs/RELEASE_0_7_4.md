# 0.7.4 聚焦模式

依目前安裝的 FlexNote 1.1.70 確認完整設定、選取狀態及 Canvas 繪製鏈，接入 InkBridge 既有原版介面與渲染器。

## 來源與範圍

- 已核對安裝包版本及 ASAR SHA-256：`55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b`。
- 最新設定父模組84227、ui狀態22676、原父頁面48626、聚焦集合79790、Canvas10764、渲染器66597及連線60647。既有46979設定介面的聚焦區塊具有相同開關、範圍、持久鍵與相連選項，保留完整原區塊；沒有替換無關設定或渲染器。
- 最新79790與既有副本原factory雜湊相同：`0f5b2d01f9786a094c3a0913ebc6efab8b0f791bcb9c1f3153fe9045d9e18e01`。66597的focusHash、drawElements正規化AST也相同；其他方法整體有版本差異，不宣稱整個渲染器等價。
- REA選定來源證據：`ev_fe730494195134160fcaf3acd54959bb9d861c3eecafd35e45ba8aea620d4524`。這是原包衍生私有來源的靜態分析；私有focus-source/receipt.json保留來源定位及factory身分。未操作正式FlexNote資料，未把原版專有原碼推送Git。

## 實作

- 接回原父頁面的鏈：選取ID、原連線集合、79790.VP計算結果，傳入Canvas10764的focusModeEnabled、focusModeDimOpacity、focusModeOptions及focusedNodeIds。
- 設定沿用原生開關、滑桿及兩個獨立選項。預設不透明度12%，0–100%、每步2%；可分別保留相連卡片與相連線條的亮度。
- 未選卡片時不淡化；取消選取、關閉模式或切到沒有選取的白板均恢復。沿用原生多選、連線與分層繪製，不另造遮罩。
- 設定依原版保存在目前裝置localStorage，跨白板使用、重開保留；不寫共享筆記或增加快照版本。

## 相關驗證

新增真實Electron `check-focus-mode.cjs` 先重現開關被停用及Canvas缺少聚焦參數，修正後通過：原生介面、實際Skia像素淡化、相連節點與線條的獨立控制、透明度0／100%、多選、取消選取、白板切換、重開保留、共享資料完整不變。

同面板既有 `check-media-file-names.cjs` 修改前後均通過；使用者此次明確增加聚焦模式後，原來「僅兩個檔名開關啟用」改為「兩個檔名開關加聚焦開關啟用」，檔名各白板保存的所有期望維持。沒有重跑無關全集。

## 交付驗證（2026-11-17）

- 封裝版通過相同聚焦測試，含實際卡片與連線像素變化。最後隔離資料 `Temp/inkbridge-original-modules-focus-yHUMuE`；收據 `private-original-editor/focus-result.json`。
- 發布序號25，build ID `e6b0956e73f3d0071346f307e1dc3a9923e7de0481460e1fc6b2d7bd595b5001`。
- 完整ZIP `InkBridge-release-0.7.4-fb88157c-9016-4cd4-97c6-b1144c65d3db.zip`，232964126 bytes，2305檔簽章／雜湊驗證通過；SHA-256 `21ba5500a3428333e71ef81484492af68d8c9fc5eac0cf2cdc0a388100d00448`。
- 0.7.3增量ZIP `InkBridge-update-4b9353fa-c359-458b-a014-ecb7708a1da6.zip`，155916 bytes、5檔，簽章及隔離PowerShell Stage通過，來源程式未改；SHA-256 `3ab5f7b543749299346f99c8ec2f542e87a7971afbf0e6e05531b32d7685fa67`。
- 兩包已放進指定OneDrive交換根目錄並核對雜湊，舊0.7.3完整ZIP已清除，正式筆記、附件、快照與診斷保留。收據 `release/delivery-0.7.4.json`（本機忽略檔）。OneDrive雲端到達時間仍由OneDrive決定。
- 使用：白板右下角齒輪→聚焦模式。0.7.3可按程式內更新；完整ZIP解壓到本機程式資料夾，執行裡面的 `Start-InkBridge.bat`。交換目錄只交付ZIP。
