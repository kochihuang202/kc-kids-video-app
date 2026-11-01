# Gemini b5fd5bc 進階功能覆核與選擇性整合

日期：2026-11-01。主線基線61fff45；審查工作樹`.worktrees/shell-navigation/inkbridge`，分支`feat/original-shell-integration`，提交`b5fd5bc8d33a4e2ec5d286b39fe2f77e240793d0`。未整包merge，也未修改Gemini工作樹。

工作樹內未找到同名獨立`CODEX_HANDOVER_SPECIFICATION.md`；已核對實際`docs/ORIGINAL_CARD_TOOLBAR_IMAGE_INTEGRATION.md`、fb28950至b5fd5bc新增程式與check-advanced-features。貼文及「100%」不是驗收證據。

## 四項需求處置

|需求|實際判定|本批處置|
|---|---|---|
|真正獨立Windows編輯視窗|確實建立BrowserWindow，這部分有用。但保存／關閉／多寫入者存在P0；原測直接stage coordinator，沒有實際Lexical輸入|暫不接入有資料遺失風險的版本；保留原分支，未宣稱視窗功能完成|
|Markdown／Word／PDF匯出|ZIP/OpenXML骨架可重用；自製Markdown轉換會漏格式／巢狀內容；PDF印錯範圍|重用Gemini createZip／packDocx，接原版Lexical隱藏編輯器與Word轉換器。單卡Markdown及Word已實際從原選單輸出。PDF暫不接入|
|轉思維導圖根節點|確有原95077轉換入口與初步三類catalog保存；目前驗證止於型別／資料列，未驗根節點編輯仍更新原卡片或引用一致性|保留原碼研究，暫不啟用mindmap白名單／未完成模型；不以出現MindmapNode當完整驗收|
|剩餘選單／卡片庫圖片|多項已由主線真實操作測試涵蓋；真實檔案尺寸投影可用。別名／額外回傳欄位未由原版需求證明|採用CAS intrinsic width/height投影思路，保留主線native type及軟刪除規則；實際卡片庫回歸通過，不搬回其假尺寸／假圖片測試|

## P0及證據

1. Gemini host的`child.on('close')`捕捉`__standaloneFlush()`例外後仍設approved並close。保存失敗會被當成可以關閉；不能併入。
2. Gemini `finishClose`呼叫各子視窗close後立即database.close，未等待子視窗非同步flush。父視窗關閉可先關閉仍被子視窗使用的資料庫。
3. `standalone-card.mjs`檢查`coordinator.dirty`，但目前PersistenceCoordinator沒有此屬性；真正狀態是pending/inflight/beforeFlush。`!coordinator.dirty`永遠為真，不能保護未保存編輯。
4. revision廣播直接提高renderer revision，不代表該renderer的舊草稿已基於該版本；可繞過原本的workspace stale檢查。單純廣播不是版本柵欄。
5. 子視窗coordinator缺少beforeFlush讀取實際Lexical與composition等待；只靠原onChange延後回呼，Ctrl+S／立即關閉可能早於最新內容。beforeunload回傳Promise也不能作為關閉保存保證。
6. 子視窗用`updated.isTrashed`檢查回收站，但目前該屬性在cardMetadata，不在contents；`has:()=>true`且未知服務回success亦會掩蓋缺失。
7. PDF handler對發出請求的視窗直接printToPDF，cards陣列未決定列印內容，可能把白板／工具列一起印出。原背景實際另建`/[locale]/print`頁面，等待`__PRINT_READY__`並有單卡preview流程；目前不以自行拼一份假列印頁替代。
8. 心智圖根節點保留NoteCard objectId，容器實例contentId則是mindmap ID；Gemini未驗獨立編輯／onNodeContentChange／保存如何解參照。主線現有文字保存邊界不能直接套入新的容器，須先驗根節點編輯、原卡片多白板引用及失敗復原。

對歷史原因的修正：WeakMap本來處理單一renderer內的多editor回呼，不是跨進程同步機制；REG-103不能被概括為「WeakMap錯誤」。Schema白名單是未支援模型的安全邊界；把kind加進白名單不等於完成整個模型。主線已含PDF、連線級聯、固定profile origin及閃動修正，不能被Gemini較舊host覆蓋。

## 實際重用與修正

- Gemini createZip／packDocx移至自有`src/main/export-packages.cjs`，保留來源提交註記；補ZIP local／central兩處UTF-8名稱旗標，確保中文檔名被標準解壓器正確讀取。
- 封裝邊界位於`src/main/original-exports.cjs`：每次獨立UUID目錄、拒絕任意renderer輸出路徑、Windows安全檔名（含裝置保留名稱）、CAS讀取驗hash、缺附件拒絕而非漏圖、大小／media路徑限制。現階段單卡匯出，不用其他卡片body冒充完整Markdown批次。
- 原版來源：64744完整隱藏importModal編輯器、51245事件、73866原Markdown轉換／79138與34771 transformer、15457原匯出選單、27560原Markdown→Word XML／圖片契約。沒有採用Gemini另寫的簡化AST轉換器。
- 隱藏編輯器原setEditorState後立即讀取有讀到上一份內容的風險；在這個專用分支加Lexical discrete提交，再用原匯出函式讀取。匯出不註冊成使用者筆記editor，不改筆記內容。
- 原Word helper解析圖片失敗原本吞例外繼續無圖輸出；本批改為失敗，不宣稱成功。resolveExportImages只讀已驗完整性的本機CAS，不自行下載外部圖片。
- 卡片庫真實尺寸思路沿用Gemini，但不沿用固定400x300或`isTrashed:false`。缺失／無效metadata不造假尺寸，不讓回收站圖片重新出現在庫中。

## 實測與限制

- check-native-exports：真實原生選單→隱藏Lexical→Markdown ZIP／Word DOCX，經Windows .NET ZIP讀取器解壓並檢查中文檔名、文字、粗斜體組合、Word XML關聯與CAS圖片原始bytes；匯出前後所有筆記內容完全相同。不是只比PK／PDF檔頭。
- original-exports.test.cjs及相關original-catalog：4項通過，覆蓋缺附件拒絕、同名不覆寫、回收站拒絕、Word路徑／entity限制、圖片真尺寸與trash保護。
- check-native-library-attachments：實際搜尋、加入白板、刪除復原、CAS保留、重啟通過。未重跑完整unit／desktop／壓測套件，也未把舊M1測試當成新獨立視窗驗收。
- Word驗證到OpenXML／附件內容與獨立解壓，不等於已在桌面版Microsoft Word完整排版驗收；原Word轉換器的表格／列表等呈現仍須針對性驗收。不宣稱所有26種自訂節點完整無損。
- PDF匯出、獨立視窗、心智圖轉換仍未完成整合；下一步應依上述P0逐項修正原分支，不能以「預先合流」為由跳過真實編輯、立即關閉、並行寫入及故障注入驗證。

## 使用方式

正常關閉再以`Start-InkBridge.bat`開啟。選卡片→更多→匯出→Markdown／Word。檔案保存在本機隔離profile的`exports/<UUID>/`，完成toast顯示路徑；桌面預設根目錄為`inkbridge/private-original-editor/profiles/desktop/exports`。Markdown ZIP包含md及media，旁邊也保留同樣相對路徑的可讀檔案。未完成另選目的地／批次匯出UI，不將其列成完成。

原factory、圖片、輸出檔與測試profile不提交Git；提交封裝器、自有IPC適配、patch與測試。Gemini原分支及紀錄保持不變，能繼續修正交接。
