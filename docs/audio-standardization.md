# 批次整理標準 MP3

`scripts/standardize_mp3.py` 遞迴讀取指定資料夾的 MP3，將**每一個檔案**輸出成另一棵同名資料夾，供使用者自行貼回 Mac。來源只讀、不建立備份、不自動覆寫 Mac、不改 App／D1。AppleDouble `._` 中繼檔、備份與暫存檔不列入。

```powershell
python scripts/standardize_mp3.py --source "<來源資料夾>" --output "<另一個輸出資料夾>" --ffmpeg "<ffmpeg.exe>" --gui
```

- 僅需要 Python 標準函式庫、Tkinter 與 FFmpeg。找不到系統 FFmpeg 時，會嘗試專案已安裝的 `node_modules/ffmpeg-static/ffmpeg.exe`。
- 優先以 stream copy 重新封裝，不重新壓縮音訊。再次以真正的 MP3 demuxer 讀取中間檔，清掉錯誤 MP4／ID3 封包；不假設每個檔案的第一包都應刪除。
- 無法 stream copy 時，才嘗試高品質 MP3 編碼；不使用音量、降噪、變速或裁切濾鏡。
- 每個輸出完整解碼驗證通過後才移入最終輸出資料夾。失敗列入報告，不留下可誤認為完成的半成品。
- 預設同時處理兩檔，網路原檔每檔只複製一次到本機暫存；不啟動數百個 FFmpeg。可用 `--workers 1` 降低負載。
- 同一組參數重跑可接續：核對來源大小／修改時間與既有輸出 SHA-256，已完成且未變更的檔案略過。
- 輸出資料夾只放要貼回的音訊；進度與 `results.jsonl`／`summary.json` 放在旁邊的 `<輸出資料夾名稱>-processing`。視窗會自行顯示進度、完成與失敗，不需要 AI 定期監視。請勿對同一輸出同時開兩份工作。
- 視窗的停止按鈕會做完目前檔案後停止；重新執行可續作。關閉 Codex 不會停止獨立啟動的 Python 視窗；電腦與 Mac 分享須持續在線。

## 已發生的實例（REG-MEDIA-001）

2026-11-03，第三季 `ml3-057` 的 `.mp3` 實際是外加 ID3 的 MP4，內部為 MP3 音訊，還有一個無效的標籤封包。電腦可播；iPad 診斷為 `MEDIA_ERROR_4`、遠端來源、零播放進度。Mac HEAD 與檔頭／檔尾 Range 皆正常，回傳 `audio/mpeg` 與不符的實際封裝。

改成標準 MP3、清除無效標籤封包後，Mac HTTP 雜湊與本機輸出一致，完整解碼無錯；使用者明確確認 iPad 已可播放。這是該集的真機驗收，不能推論其他音訊都已真機測過。

使用者隨後要求第三季整季統一輸出，自行貼回，不另備份、不持續消耗 AI 監視。當時只有第一至第三季，第三季共 240 個 MP3、約 1.57 GB，含各故事子資料夾。

## 維護測試

設定 `TEST_FFMPEG` 後執行 `python -m unittest discover -s scripts/tests -p test_standardize_mp3.py -v`。使用真實 FFmpeg 檢查正常 MP3、偽裝 MP3 的 MP4＋ID3、來源不變、損壞檔無最終輸出、續作校驗及變更後重做。這是媒體批次工具，不需要重跑網站 Playwright。
