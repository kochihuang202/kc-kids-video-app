# 鎖屏純聽播滿次數後換集：研究紀錄

日期：2026-10-26。使用者要求先研究；以下方案尚未實作，也未宣稱實機修復。

## 目前證據與版本比對

- 目前原生播放器仍是已核准的 `d1e3d2a`。本輪 YouTube 初始化修復沒有修改 `NativeMediaPlayer.tsx`、重播次數、原生換集或下載流程。
- `bdb3dce` 加入「指定次數後下一集」；此前 `05e428d` 的學習純聽主要依原生 `loop` 重複同一首。只恢復更早的無限循環不能驗證完整的五次換首需求。
- 目前前四次依原生 loop 重播，第五次允許自然結束，`advanceLearningListenTrack()` 導航下一集，再由 WatchPage 非同步取得裝置／影片／額度／本機檔案／分類資料，設定新來源並要求播放。原生元素會沿用，但換首仍有結束後等待資料的空檔。
- `d1e3d2a` 已提早到來源設定後便呼叫 play，不等 metadata；單純再加同樣的 play 呼叫沒有新的技術依據。
- 本輪已讀的實機紀錄：15:11:04 Session `1fe5112f…` 在 Wow 第五次結束要求下一集；15:11:06 的 `dc12629c…` 是本機 blob 來源、readyState=1、無緩衝、pending play、位置 0，15:11:28 恢復可見後才 loaded/playing。這不支持把該次問題歸因於 Mac 或 VPN，也不等同「時間前進但音訊輸出無聲」。
- `playing`、play promise resolve、系統小視窗的時間前進，都不能單獨證明實體喇叭有聲音。

## 官方資料

- [Safari 27 / WebKit 發布紀錄](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) 列出背景播放清單無法移到下一項的修正，編號 172676372。這是相關引擎問題的證據，不能據此宣稱這台 PWA 的問題已定位或升級必定修復。
- [WebKit 261858](https://bugs.webkit.org/show_bug.cgi?id=261858) 是舊版 iOS 的相似回報：standalone 在歌曲結束後無法開始下一首，回到頁面才繼續，而 Safari 正常。不可把它直接當成 iOS 27 的確切根因。
- [HTML media 規格](https://html.spec.whatwg.org/multipage/media.html#media-playback) 區分 loop 回到開頭與自然 ended 後的暫停；「同曲重播成功」不能證明「換檔接續成功」。
- [W3C Audio Session 草案](https://www.w3.org/TR/audio-session/) 提供 `navigator.audioSession.type = "playback"`，屬可獨立測試的方向，並非背景執行或自動播放保證。
- [WebKit 261554](https://bugs.webkit.org/show_bug.cgi?id=261554) 曾處理背景 AudioContext，並有相似音軌換首回報；留言中的第二個靜音元素 workaround 有其他人明確回報無效。不採用持續靜音播放或反覆強制 play 作為預設方案。

## 建議評估順序

1. **小範圍對照準備好的下一首。** 在目前一首播放期間，準備下一個合法項目的 metadata 與來源（下載項目可預先建立下一首的 blob URL）；換首時不再等待整個頁面載入流程。沿用一個音訊元素、明確的播放意圖及來源世代；不要用第二個有聲播放器。只取合法前五部／目前佇列，不預先拉整套串流，也不要提早撤銷仍在播放的 blob URL。這可測試應用層空檔，尚不保證克服系統背景限制。
2. **另一輪才試 Audio Session playback。** 在支援 API 的實機中單獨比較預設 auto 與 playback，補 statechange／音訊中斷／換首前後事件。避免與第一項同時開啟而無法歸因；正確釋放生命週期也需測試。現行程式只讀狀態，未設定 type。
3. **若 Web 逐首接續仍失敗，評估純聽連續音訊包。** Mac 用 [FFmpeg concat](https://ffmpeg.org/ffmpeg-formats.html#concat) 製作 A×5 → B×5 → … 的有限音訊包，讓換集發生在同一媒體內；這是降低換來源依賴的架構候選，非已驗證修法。要另處理起訖區間、可播清單、次數變更、孩子切換、章節／紀錄映射、離線下載空間及失效更新，成本較高。來源格式不一致可能要轉碼，不能假設所有檔案可直接無損拼接。僅適用自家檔案，不套用 YouTube。

## 最小實機驗收

- 同一部下載影片，以 Safari／Home Screen PWA 對照；記錄「設定」中的 OS 版本，不能只信 UA。
- 每次僅改一個條件。使用兩首短測試音訊、次數 2 先快速定位，再測實際次數 5。驗證兩次換集與最後一首回第一首，持續鎖屏、亮起但未解鎖、解鎖，以及系統 Pause → Play。
- 分開辨認：沒有 next request、已 next 但資料未就緒、play rejected、play pending、進度凍結、有進度卻無聲。前端診斷只能判斷前五類，最後一類仍需人實際聽。
- 桌面 Playwright 保護佇列、元素身分、次數、起訖、Session 與離開清理；實體 iPhone/iPad 有聲才是鎖屏驗收，不能用 headless 結果代替。
