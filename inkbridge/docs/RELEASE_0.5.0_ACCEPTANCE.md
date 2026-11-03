# 0.5.0 私人可攜交付驗收

交付日期：2026-11-03（台灣）。程式來源提交 `eb9b4a26f3f8`，Manifest `sourceTreeClean: true`。

- ZIP：`InkBridge-0.5.0-eb9b4a26f3f8-7c0531.zip`，213,621,956 bytes。
- SHA-256：`d019bda36d0c82cf3312a72aa2a76574a63ad680425c26627a1827c0c2751b2a`。
- 已複製到使用者指定的 OneDrive `01_Home/21_InkBridge` 根目錄；複製後雜湊一致。同名 `.sha256` 與 `InkBridge-使用說明-0.5.0-eb9b4a2.txt` 一併交付。舊 ZIP、snapshots、assets 未覆蓋。
- 交付證據（私人／忽略）：`release/last-portable-build.json`、`portable-test-result.json`、`program-update-acceptance.json`、`onedrive-delivery.json`。

## 本次實測

| 指令／測試 | 結果與證據邊界 |
|---|---|
| check-seamless-sync.cjs | 真實 Electron、隔離 A/B：啟動及保持開啟時接續後續快照；同一 HWND；兩視窗保留；觀看位置本機化；本機修改不覆蓋；合成組字 barrier；過期 epoch 的實際 main IPC handler 拒絕寫入 |
| check-sync-entry.cjs | 真實 Electron：缺 DB 先等待、不初始化可編輯白板；到齊自動重試；一次配對；舊工作區快照保留；重開不重複配對 |
| sync-outbox.test.cjs | 真實 SQLite：離線快照持久保留、無變更同 UUID、恢復發布、父版本鏈及同步路徑改變 |
| program-updates.test.cjs | 真實 PowerShell／隔離檔案：簽章破壞、越界路徑、缺 ZIP、錯誤基底、重入去重、檔案獨占鎖定、成功 health、失敗啟動回復 |
| check-portable-update.cjs | **最後交付包**的真實更新按鈕 → Windows 隱藏程序代理 → 舊程式退出 → 3 個檔案／108,223 bytes 簽章增量 → 新版 DB/UI health ACK。最後未另按保存的中文保留、設定保留、可正常關閉新版。測試更新僅放 TEMP，未發布測試版 0.5.1 |
| check-portable.cjs | **最後 ZIP**實際解壓到中文／空白路徑；逐一驗證 2,074 檔案；PATH 無 Node；BAT 啟動原生編輯器；SQLite 保存中文與重開；程式資料夾改名後資料仍在；AppData 隔離且無預設交換路徑 |
| 既有相關回歸 | check-standalone-windows、check-board-windows、check-native-bookmarks；persistence、note-version、workspace-snapshots、original-bookmarks 等定向測試已通過。未重跑無關全套 |

## 首次使用與往後更新

兩台各完整解壓此版到本機獨立程式資料夾，關閉舊版後雙擊 `Start-InkBridge.bat`。設定各自的 OneDrive 交換路徑；若列出不同工作區，以時間、電腦名稱及數量選定同一份主要工作區，只做一次。舊開發版請先 Ctrl+S 送出快照，資料不直接搬入新 AppData。

日後只對這個完整版本或可接續的版本發布相容簽章增量，右上角按「更新並重新啟動」。本次未放假更新包，也沒有將工作資料庫置於 OneDrive 直接共寫。

## 尚未驗證

兩台實體電腦的 OneDrive 實際傳輸／公司政策差異、物理輸入法全組合、真正斷電、大型工作區效能與所有既有功能全回歸。合成組字測試不是實體 IME 認證；本機 OneDrive 目錄寫入成功不等於雲端已上傳。測試隔離診斷事件與原版 1.1.66 更新方式的來源／差異詳見 `SEAMLESS_SYNC_AND_UPDATES.md`、`FLEXNOTE_UPDATER_EVIDENCE.md`。
