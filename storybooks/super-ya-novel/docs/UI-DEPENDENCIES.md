# 格式與排版先查現成方案

## 2026-10-20 封面單一入口與練習完成按鈕

查核 [MDN 原生連結](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a) 與 [CSS specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity)。兩張模式卡沿用現有 `primary mode-primary` 外觀，各保留一個帶有真實目錄網址的原生連結，保留瀏覽器前後頁及預覽參數。不新增套件、字型、授權或相容性依賴；繼續使用 Han.css 3.3.0（MIT）。

練習完成頁的 `.practice-panel > button` 把主按鈕國字改成深綠，蓋過 `.primary` 的白字；`:hover` 的權重較高，才讓文字重新出現。僅為此處的主按鈕明確設定白字與綠色邊框，維持注音元件的獨立顏色，不改全域 ruby/rb。以真實完成單元的流程量測國字和注音在一般、hover、焦點及觸控狀態的對比。

## 2026-10-17 移除設定中的朗讀操作

依使用者要求，兩種模式的設定面板都移除全文朗讀與停止按鈕；段落、詞語朗讀與播放中的停止控制保留。查核 [MDN 原生 button](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button)，沿用現有原生按鈕與抽屜，不更動排版或增加套件；無新增版本、授權或裝置相容性依賴。保留 Han.css 3.3.0（MIT）及原有語速設定。

## 2026-10-17 設定抽屜精簡

查核 [MDN details 原生揭露元件](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details)。本次只刪除抽屜中重複的閱讀工具／進度／目錄，不改動已驗證的原生 details/summary 開關、焦點及背景遮罩；不增加套件或新授權。沿用 Han.css 3.3.0 注音，標題統一為「閱讀設定」。以 Chromium 窄畫面與 WebKit 平板流程驗證保留功能。

使用者於 2026-10-17 要求：每次格式調整先上網查相應套件或標準，檢查授權、維護與裝置支援；有適用方案時優先採用，不以反覆猜測 CSS 代替現成排版規則。

## 本次查核及採用

- **Han.css 3.3.0**：[官方原始碼](https://github.com/ethantw/Han)，MIT。採用官方 `Han.normalize.getZhuyinHTML`、編譯後 `[zhuyin]` 注音模組與 `han.woff`；固定版本、自行託管於 `public/vendor/han-3.3.0`，保留 MIT 文件。不啟用全頁自動轉換或整套全域 CSS，避免重排既有詞語標記與來源段落。
- 注音長度1/2/3、聲調與輕聲位置由套件負責。專案只做 ruby/rt 包裝和既有不斷字規則的相容處理，不再自行排列每個注音 span。
- **pinyin-pro**：[官方原始碼](https://github.com/zh-lx/pinyin-pro)，維持現有語境字音修正及校訂流程。它是讀音來源，不負責注音視覺排列。
- **注音 IVS 字型**：[Bopomofo IVS Font Specification](https://github.com/ButTaiwan/bpmfvs)。已查核；字型內建注音與選音機制可用於教材，但本版需要保留分離、逐字校訂的讀音及注音開關，因此不直接替換成合成字型。
- **Web Awesome Core**：[官方按鈕文件](https://webawesome.com/docs/components/button/)、[授權](https://webawesome.com/support)。Core MIT，可自託管。提供現成大小、外觀、連結按鈕及 disabled 狀態。已評估；本輪保留原生按鈕的事件與鍵盤介面，不在修復注音時同時改成有 Shadow DOM 的元件；若後續採用，先用獨立畫面驗證注音 slot、焦點及朗讀。
- **W3C**：[中文排版需求](https://www.w3.org/International/clreq/#positioning_of_zhuyin)、[Ruby 標記](https://www.w3.org/International/articles/ruby/markup.en)。作為漢字右側注音及聲調排版參考；不把僅有 ruby 標記當作已完成臺灣注音排版。

Han.css 是既有較舊的框架，本專案只採用經檢查的注音部分。瀏覽器支援不只根據套件 README 宣稱，還需以本專案實際字串、字級、控制項及裝置驗證。`zhuyin-flow.js` 用文字 Range 量測三符號注音是否直排、與國字上下對齊，而不是只計算 DOM 是否存在。

## 格式變更的完成條件

1. 留下官方文件、版本、授權與採用／不採用原因。
2. 先用完整畫面驗證，不只看單一元件。
3. 注音檢查一／二／三符號、四聲及輕聲；正文、標題、主按鈕和接續卡都要看。
4. 檢查字級、注音開關、長標題及平板直橫向。
5. 真正檢查字形及聲調位置；注音數量測試不能代替視覺驗收。
