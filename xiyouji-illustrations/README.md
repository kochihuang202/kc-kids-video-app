# 西遊記第 001、002 集逐節插圖

本次範圍只包含第 001、002 集，保留各七個故事小節。第 001 集沿用原有六張圖，補上「居安思危，漂洋尋仙」；第 002 集新增七張。兩集合計十四個小節、十四張圖。故事正文、注音、生詞卡與互動內容保留。

## 交付與來源

- 正式站：<https://xiyouji-kids.pages.dev/>
- 本次部署：<https://a6afcffa.xiyouji-kids.pages.dev/>
- 新增的八張 JPEG：`images/`。已安裝至 `C:\Users\ji3cp\Documents\xiyouji-reader\images`。
- 插圖生成工具：內建 `image_gen.imagegen`。以原有第 001 集插圖作為水彩畫風與悟空造型參照；第 002 集第 3、4 節另以新生成的拜師圖保持祖師造型。
- 生成用畫風、逐張場景與替代文字：`prompts.json`。生成原檔來源：`generated.json`。原始 PNG 保留於工具回傳的位置，網站使用壓縮後 JPEG。
- `illustrations.json`：十四節的標題與配圖對應，保留故事文本作為配圖情節核對資料。
- `pages/`：安裝後的兩集 HTML 快照。
- `engine/recompile_all_10_episodes.py`：安裝後的編譯器快照。

## 重新編譯

`section_illustrations.py`、`illustrations.json` 已安裝至 `C:\Users\ji3cp\Documents\FXN-Antigravity`。編譯器在 `render_unified_page` 後呼叫 `apply_section_illustrations`，只處理清單內的第 001、002 集，避免重編時漏掉新圖片。原有圖片不重複加入；小節標題若改變則要求重新核對配圖，避免默默錯配。

`install.py` 會安裝八張圖、兩集 HTML 與編譯器接點；會拒絕覆蓋同名但不同內容的圖片，並保留首次安裝前的本機備份。備份及中間 PNG 不提交 Git。安裝時對第 003～070 集的 SHA-256 前後核對，68 集均未改變。

系統 `py` 與專案 `.venv_stt` 目前找不到其原 Python 安裝；本次使用 Codex 隨附的 Python 執行配圖、檔案核對與測試，沒有重跑會改寫第 003～010 集的全批次編譯器。

## 檢查

- `python -m unittest discover -s xiyouji-illustrations -p 'test_*.py' -v`：三項通過，涵蓋逐節補圖、重複編譯、既有內容保留、小節標題變動拒絕及不相關集數保留。
- `python xiyouji-illustrations/section_illustrations.py verify`：十四節均有圖，沒有遺失檔案。
- `reader-flow.js`：依既有閱讀器測試，檢查注音開關、字級、生詞卡及關閉，再檢查每節恰好一張圖、所有圖片成功解碼，以及 1280px/390px 下圖片不溢出。
- 修改前瀏覽器確認第 001 集第七節無圖；安裝後本機兩集檢查均通過。
- 正式站部署後重跑相同瀏覽器流程：第 001、002 集各七節、七張圖片均成功解碼，注音、字級、生詞卡、桌機與手機圖片寬度全部通過。
- 新增圖片區塊移除後，兩集原 HTML 的非空白內容與首次備份相同，包含正文、注音、詞彙與互動。
- 原頁面既有 `recordProgress is not defined` console 錯誤仍存在，本次沒有更動閱讀進度程式；實測的注音、字級、生詞卡操作通過。

Playwright CLI 支援 `run-code --filename xiyouji-illustrations/reader-flow.js`。本機預覽根目錄為 `C:\Users\ji3cp\Documents\xiyouji-reader`，連接埠 8767。先將目前分頁開到正式站，再執行相同流程即檢查正式站。
