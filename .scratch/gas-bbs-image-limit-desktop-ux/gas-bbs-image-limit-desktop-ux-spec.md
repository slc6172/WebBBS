# Spec：圖片張數突破 + 桌面體驗優化（快捷鍵／拖曳／貼上上傳）

**Labels:** `ready-for-agent`
**關聯文件**：`bbs-gas-spec.md`（原始規格）、`gas-bbs-perf-round-review.md`（第六輪安全性審查報告）、`handoff-gas-bbs-round6-security-review.md`（第六輪交接文件）
**Ticket 系列**：本輪沒有沿用前六輪任何一組編號，是獨立的新一輪功能規劃。

---

## Problem Statement

BBS 目前只能透過滑鼠操作，桌面版使用者（尤其是重度使用者）沒有任何鍵盤捷徑可以加快瀏覽文章、發文的速度，也無法用拖曳或剪貼簿貼上的方式上傳圖片，只能一張一張點檔案選取。

同時，文章一律只能附最多 3 張圖片，這個限制寫死在資料表結構（`Articles` 表的 `imageUrl1`/`imageUrl2`/`imageUrl3` 三個獨立欄位）跟前端 UI（3 個固定格子）裡，使用者想多分享幾張圖時無法附上。這個限制還間接影響 LINE 群組聊天彙整發文功能——為了讓彙整出來的文章符合「最多 3 張圖」的限制，LINE bot 目前設計成「累積到 3 張圖片就必須立刻發文」，即使群組討論還沒告一段落，圖片數一到就會被迫發文、把還在進行中的對話切成兩篇文章。

## Solution

- **圖片張數突破**：把 `Articles` 表的 `imageUrl1~3` 三個固定欄位，改成單一個 `imageUrls` 欄位、以 JSON 陣列字串儲存不定長度的圖片連結清單。前台發文/編輯的圖片上限放寬到 99 張，另外加一道「單次發文圖片總大小 30MB」的前端檢查，避免瀏覽器到 GAS 的請求因為 payload 太大而失敗。
- **既有資料遷移**：提供一支一次性維運工具，把既有文章的 `imageUrl1~3` 資料轉換成新的 `imageUrls` 格式，比照專案既有的 `tools/fixArticleCreatedAtFormat.gs.js` 慣例。
- **LINE bot 彙整發文門檻放寬**：`LINE_DIGEST_IMAGE_THRESHOLD` 從 3 調高到 99，讓群組討論不會再因為湊到 3 張圖就被迫提前發文；同時修正一個過程中發現的既有隱藏問題——目前彙整發文時，超過 3 張的圖片會被悄悄截斷丟棄，改成新格式後這個問題自然消失。
- **桌面鍵盤快捷鍵**：在桌面雙欄版面新增全域鍵盤事件——`↑`/`↓` 切換上一篇/下一篇文章、`Ctrl+K` 發新文章、`Esc` 關閉燈箱/彈窗、`←`/`→` 依情境切換文章列表頁或（燈箱開啟時）切換圖片。
- **拖曳/貼上上傳圖片**：發文（桌面/手機）、編輯文章的圖片上傳表單，除了原本的點檔案選取，新增拖曳檔案到上傳區、以及直接在編輯區貼上剪貼簿圖片兩種輸入方式。
- **文章詳情頁圖片呈現**：從固定顯示最多 3 張圖，改成縮圖網格 + 點擊開燈箱瀏覽，支援任意張數。

## User Stories

1. As a 桌面版看板使用者, I want 用 `↑`/`↓` 鍵切換到上一篇（較新）/下一篇（較舊）文章, so that 我不用每次都伸手點滑鼠就能快速逐篇瀏覽。
2. As a 桌面版看板使用者, I want 按 `↓` 到當頁最後一篇文章時鍵盤操作直接停住不動, so that 我不會在還沒察覺換頁的情況下被意外帶到下一頁。
3. As a 桌面版看板使用者, I want 用 `←`/`→` 切換文章列表的頁次, so that 我不用滑鼠捲動去點頁碼。
4. As a 桌面版看板使用者, I want 按 `Ctrl+K` 直接跳出發新文章的表單, so that 我不用先找到「發表文章」按鈕在哪裡。
5. As a 桌面版看板使用者, I want 按 `Esc` 關閉目前開啟的燈箱或彈窗, so that 我可以快速回到瀏覽狀態，不用找關閉按鈕。
6. As a 正在文章標題/內容輸入框打字的使用者, I want 我打的字元（包含空白鍵、方向鍵移動游標）不要被快捷鍵吃掉, so that 我可以正常輸入內容。
7. As a 正在瀏覽多張圖片燈箱的使用者, I want 用 `←`/`→` 切換同一篇文章的上一張/下一張圖片, so that 我不用點小小的縮圖或箭頭按鈕。
8. As a 關閉燈箱之後回到文章列表的使用者, I want `←`/`→` 自動恢復成切換文章列表頁, so that 同一組按鍵在不同情境下都符合直覺、不會搞混。
9. As a 手機版使用者, I want 這組鍵盤快捷鍵完全不影響我的操作方式, so that 我原本熟悉的手機瀏覽方式不會被打亂（手機沒有實體鍵盤操作情境，此功能範圍不含手機）。
10. As a 發文者, I want 直接把圖片檔案從桌面拖曳到上傳區, so that 我不用先點「選擇檔案」再從檔案總管裡找。
11. As a 發文者, I want 在發文/編輯畫面直接貼上剪貼簿裡的圖片（例如截圖後直接 Ctrl+V）, so that 我不用先把截圖存成檔案才能上傳。
12. As a 發文者, I want 一篇文章最多可以附到 99 張圖片, so that 我可以完整分享一系列相關的圖片，不受限於舊有的 3 張上限。
13. As a 發文者, I want 如果我選的圖片總大小加起來太大（超過 30MB），在按下發布前就先被告知並拒絕, so that 我不會遇到「按了發布卻莫名其妙失敗」的困惑體驗。
14. As a 發文者, I want 可以個別移除已選擇的圖片（不限於固定 3 個格子）, so that 我可以自由調整要附上的圖片清單。
15. As a 讀者, I want 在文章詳情頁看到縮圖網格呈現的所有附圖, so that 我可以一眼看出這篇文章附了幾張圖、大致內容是什麼。
16. As a 讀者, I want 點擊任一張縮圖可以開啟燈箱放大瀏覽, so that 我可以看清楚圖片細節。
17. As a 編輯自己文章的使用者, I want 編輯表單顯示的既有圖片跟新增圖片可以混合管理（保留舊圖、刪除舊圖、加新圖）, so that 我不用每次編輯都重新上傳全部圖片。
18. As a LINE 群組成員, I want 群組討論不會因為湊到 3 張圖片就被迫提前發文, so that 一段完整的討論串可以盡量彙整成同一篇文章。
19. As a LINE 群組成員, I want 即使我方貼了很多張圖片，最終彙整出來的文章不會悄悄漏掉超過 3 張以外的圖片, so that 我分享的所有圖片都真的會出現在最終文章裡。
20. As a 系統管理者/部署者, I want 有一支一次性工具可以把既有文章的舊格式圖片欄位轉換成新格式, so that 舊資料不會因為改了 schema 就全部消失或顯示異常。
21. As a 系統管理者/部署者, I want 遷移工具可以重複執行也不會把資料弄壞（idempotent）, so that 就算不小心跑兩次也不用擔心資料損毀。
22. As a 系統管理者/部署者, I want 遷移工具跑完後在執行紀錄看到清楚的統計數字（轉換成功、已是新格式跳過、空白跳過、無法解析需人工檢查）, so that 我可以在部署新程式碼前確認資料真的轉換完成。
23. As a 系統管理者/部署者, I want 部署文件清楚寫明「先跑遷移腳本、確認無誤，才能部署新程式碼」的順序, so that 我不會因為部署順序錯誤導致既有文章圖片顯示異常。
24. As a 系統管理者/部署者, I want 文件如實記錄「LINE 每日彙整換日時間，程式碼預設是 00:05，但目前實際運作已手動調整為 23:50」這個落差, so that 之後如果要重新安裝 trigger，我知道實際運作時間跟程式碼預設值不一致，不會被誤導。
25. As 負責維護程式碼的開發者, I want 圖片驗證邏輯繼續維持在 `imageStorage.js` 的純函式裡（不落回 `Code.js` 這種不受測試覆蓋的 glue 層）, so that 未來還是可以用 Node 測試涵蓋這段邏輯，延續本專案既有的安全性修復慣例。
26. As 負責維護程式碼的開發者, I want 新的燈箱渲染程式碼使用 `addEventListener` 綁定事件、不要用 inline `onclick="...('...')"`, so that 不會把安全性審查報告已經記錄在案、尚未修補的 XSS 相關脆弱模式複製到新程式碼裡。

## Implementation Decisions

### 資料模型（schema.js）

- `SHEET_SCHEMAS.Articles` 把 `imageUrl1`、`imageUrl2`、`imageUrl3` 三個欄位合併成單一個 `imageUrls` 欄位，儲存 JSON 陣列字串（例如 `'["https://...","https://..."]'`）。
- **空值的標準表示法固定為 `'[]'`**（不使用空字串 `''`），所有讀取端一律做 `JSON.parse`，parse 失敗或空陣列都視為「沒有圖片」，不額外判斷空字串這個特例。
- 陣列內容**永遠不留空缺（不儲存空字串佔位）**——這跟舊的 `imageUrl1~3` 用空字串代表「這格沒圖」不同，新格式下只要沒圖片就不會是陣列裡的一個元素。

### 核心驗證邏輯（imageStorage.js）— 唯一 seam

- 延伸既有的 `resolveImageSlots(imageSlots, existingImageUrls)` 純函式：
  - 迴圈上限從寫死的 `3` 改成 `imageSlots.length`（並在函式內部再加一層防禦性上限檢查，即使呼叫端沒擋住超過 99 張，這裡也要拒絕並回傳明確錯誤，不能只靠前端檢查）。
  - `resolved` 從固定長度 `['', '', '']` 改成動態陣列，且**組裝結果時跳過空字串**，不再保留三格式的空位。
  - 既有的「字串型的 slot 必須完全等於 `existingImageUrls` 裡的某個值，否則整個請求視為異常、拒絕」這條核心安全邏輯（H3 修復的核心）**原封不動延續**，只是判斷範圍從固定 3 格擴大到整個陣列。
  - 回傳形狀（`{resolved, newImages, newImageSlotIndexes, error}`）維持不變，呼叫端（`Code.js` 的 `resolveImageSlots_`）不需要跟著改介面。

### 寫入路徑（postArticle.js / editArticle.js）

- `escapeFormulaInjection` / `escapeFormulaInjectionFor_` **繼續套用在陣列裡的每一個 URL 元素**，逐一跳脫完再 `JSON.stringify` 組成最終要寫入的字串（延續 M1 修復的既有模式，不因為換成陣列儲存就省略）。
- 額外的結構性防禦：因為最終寫入 Sheets 的值一定是以 `[` 開頭的 JSON 字串，即使裡面的 URL 內容有異常字元，儲存格本身不會被 Google Sheets 判定為公式（公式注入需要儲存格第一個字元是 `=`/`+`/`-`/`@`）——這是額外的縱深防禦效果，不是拿來取代逐元素跳脫的理由。
- 沿用既有的 `Unlocked_` 核心 + 薄 wrapper 模式，不新增變體。

### 讀取路徑（boardBulk.js / articleDetail.js）

- 原本讀 `imageUrl1`/`imageUrl2`/`imageUrl3` 三個欄位、組成陣列回傳給前端的地方，改成直接讀單一 `imageUrls` 欄位、`JSON.parse` 後回傳。
- `boardBulk.js` 的整批 range read 範圍縮減一欄（原本 12 欄，`imageUrl1~3` 三欄併成一欄後變 10 欄），**讀取次數不變，只是每次讀到的欄位數變少**。

### LINE bot（lineDigestThreshold.js / lineBotGlue.js）

- `LINE_DIGEST_IMAGE_THRESHOLD` 常數從 `3` 改成 `99`。
- `createArticleUnlockedFor_` 組出的 `imageUrls` 陣列**不再截斷成前 3 個**，整個陣列原封不動傳給 `createArticleUnlocked_`（連帶修正了目前彙整發文會悄悄丟棄超過 3 張以外圖片的既有問題）。
- 圖片本身的下載/存檔時機不變——LINE 圖片訊息一到就立刻各自下載存進 Drive、`LineStaging` 表只存連結字串，這條路徑本來就不會受到（前端）30MB 總量檢查影響，這裡不需要任何改動。

### 遷移工具（新檔案 `tools/migrateArticleImagesToArray.gs.js`）

- 比照 `fixArticleCreatedAtFormat.gs.js` 的既有慣例：一次性手動執行、直接寫入（非 dry-run）、idempotent（已經是新格式的列跳過不動）、只碰 `Articles` 表的圖片欄位、Logger 印出統計（轉換筆數／已是新格式跳過筆數／全空白跳過筆數）。
- 讀取每一列的 `imageUrl1~3`，過濾掉空字串，組成 JSON 陣列寫回新的 `imageUrls` 欄位。
- **不刪除、不清空舊的 `imageUrl1~3` 三欄**——遷移完成後這三欄變成程式碼不再讀取的死欄位，留給部署者之後自行決定要不要在 Sheets 介面手動刪除。
- 部署順序寫進部署文件：**必須先手動執行這支工具、確認 Logger 統計結果無誤，才能部署會讀寫 `imageUrls` 新欄位的程式碼**；新程式碼不做任何「舊欄位 fallback」的相容邏輯。

### 前端（Index.html）

- **鍵盤快捷鍵**（僅桌面雙欄版面生效，`viewMode === 'desktop'` 或既有判斷桌面/手機版面的邏輯之下才綁定）：
  - 全域 `keydown` 監聽，事件發生時先檢查 `document.activeElement` 是否為 `input`/`textarea`，若是則除了 `Esc` 以外全部不處理。
  - `↑`/`↓`：對應到目前 `selectArticle()` 邏輯，找出目前 `currentArticleId` 在已載入列表中的前一筆/後一筆並呼叫 `selectArticle()`；已在當頁邊界時不做任何事（不觸發翻頁）。
  - `Ctrl+K`：`event.preventDefault()` 後呼叫既有的「展開發文表單」邏輯（沿用 `togglePostForm()`／手機版另外處理，快捷鍵本身只在桌面生效）。
  - `Esc`：關閉目前開啟的燈箱或彈窗（`boardListPopup`/`pageJumpPopup`/新的圖片燈箱），任何 focus 狀態下都生效。
  - `←`/`→`：**依燈箱是否開啟切換行為**——燈箱關閉時對應既有的 `jumpToPage()` 上一頁/下一頁；燈箱開啟時改成切換目前文章圖片陣列中的上一張/下一張，燈箱關閉後自動恢復成換頁語意。
- **拖曳/貼上上傳**：在桌面發文、手機發文、編輯文章三處既有的圖片上傳容器加上 `dragover`/`drop` 監聽，以及在對應的文字輸入區加 `paste` 監聽讀取 `clipboardData.items`；兩者最終都餵進既有的 `validateImageFile()` 檢查流程，不新增另一套驗證邏輯。
- **圖片上傳清單 UI**：三處固定 3 格的渲染邏輯，改成「已選圖片縮圖列表 + 個別移除按鈕 + 新增圖片按鈕」的動態清單，不支援拖曳排序（本輪明確排除）。
- **總大小前端檢查**：送出前加總所有待上傳圖片的位元組數，超過 30MB 時擋下並用既有的 `showToast()` 顯示明確錯誤訊息，不呼叫 `postArticleFromForm`。
- **文章詳情頁圖片呈現**：`renderArticleImages`（既有渲染多圖的函式，目前用 inline `onclick="openLightbox('...')"`）**保持原樣不動**；新增的「縮圖網格 + 燈箱」是新的渲染路徑，**改用 `addEventListener` 綁定點擊事件、不使用 inline `onclick` 屬性字串插值**，避免把交接文件記錄在案、尚未修補的 H3 殘留脆弱模式複製到新程式碼。

### 文件更新

- README／部署文件補上：遷移工具的操作步驟與部署順序、LINE 每日換日 trigger「程式碼預設 00:05、目前實際運作 23:50（已手動調整）」的落差說明。
- `MANUAL_VERIFICATION.md` 補上這輪新功能的真人環境驗收清單（鍵盤快捷鍵、拖曳/貼上、99 張圖片上傳、30MB 總量檢查、遷移工具執行結果）——這些都是活在 `Index.html`/`tools/` 裡的邏輯，跟專案既有慣例一樣不受 Node 測試覆蓋，只能真實環境手動驗收。

## Testing Decisions

- **好測試的標準**：延續本專案既有原則——只測外部行為（輸入/輸出），不測實作細節；GAS 專屬服務（Drive/Sheets/Properties）一律用既有的依賴注入 + Node 測試手刻假物件（`test/doubles/fakeDrive.js`、`fakeProperties.js`）驗證，不連線真實 Google 服務。
- **會補測試的模組**：
  - `imageStorage.js` 的 `resolveImageSlots`：延伸既有的 `resolveImageSlots.test.js`，補上「超過 3 個/任意長度陣列」「陣列中間有空字串應被跳過」「超過 99 張時內部防禦性上限生效並回傳 error」「陣列中出現不在 `existingImageUrls` 裡的字串時整個拒絕」等案例，延續 H3 修復當初建立的測試風格。
  - `postArticle.js`/`editArticle.js`：既有測試裡涉及 `imageUrl1/2/3` 斷言的部分，改成對 `imageUrls` 陣列（JSON 字串）斷言；補上「陣列中每個元素都套用了 `escapeFormulaInjection`」的案例。
  - `lineDigestThreshold.js`：既有的 `shouldHarvestFor_`/`hasResidualContentFor_` 測試裡，門檻常數的斷言從 3 改成 99；新增「累積圖片數在 3~98 之間不觸發彙整」的案例，明確標示行為變更。
  - `lineBotGlue.js` 相關的 `createArticleUnlockedFor_` 測試：補上「輸入超過 3 個 imageUrls 時，全部原封不動傳遞、不再截斷」的回歸測試（對應修正掉的既有隱藏 bug）。
- **不會補 Node 測試的部分（延續既有缺口，非本輪新增風險）**：
  - `tools/migrateArticleImagesToArray.gs.js`——比照 `fixArticleCreatedAtFormat.gs.js`，一次性維運工具不進正式測試套件。
  - `Index.html` 裡新增的鍵盤事件處理、拖曳/貼上、30MB 前端檢查、燈箱渲染——這個專案的 `Index.html`/`Code.js`/`lineBotGlue.js` 本來就不受 Node 測試覆蓋（第六輪安全性審查報告明確記錄的既有事實），這輪不會讓這個缺口變得更嚴重，也不在這輪範圍內去補上這個缺口本身。這部分改用 `MANUAL_VERIFICATION.md` 清單做真人環境驗收。

## Out of Scope

- 圖片拖曳排序（Q3 決議明確排除，之後如需要再另開一輪）。
- H3 既有 `renderArticleImages`（舊的固定 3 張圖渲染邏輯）的輸出端縱深防禦重構——這輪只確保「新寫的燈箱程式碼不要重蹈覆轍」，不回頭改動舊程式碼本身。
- M3 webhook 簽章驗證的外部中介服務方案——上一輪安全性審查已記錄為獨立、需要額外維運服務的較大改動，不在本輪範圍內。
- L3（後端全面 `var` 改 `let`/`const`）——使用者先前已明確表示跳過，純風格改動，不影響行為，本輪不處理。
- 回覆（推文）功能新增圖片支援——本輪的圖片改動全部限於「文章」，不涉及回覆。
- `installDailyLineDigestTrigger()` 程式碼本身的預設時間改成 23:50——本輪只更新文件說明目前實際運作時間跟程式碼預設值的落差，不修改程式碼裡的 `atHour(0).nearMinute(5)`。
- 手機版鍵盤快捷鍵——手機沒有對應的操作情境，此功能範圍限定桌面雙欄版面。
- 分批/多次請求上傳圖片（繞過 30MB 總量限制的架構性改法）——這輪選擇「加一道前端總量檢查」而非重新設計上傳機制。

## Further Notes

- 這份 spec 的一個核心前提是「圖片欄位改成 JSON 陣列字串，仍然是 `Articles` 表同一列裡的一個欄位」——`boardBulk.js` 既有的整批 range read 邏輯完全不用改動讀取範圍的列數/次數，只有欄位數變少，這是這輪之所以能在「零增加 Sheets 讀取次數」前提下做完整個功能的關鍵設計選擇。如果之後有人考慮把圖片改成獨立的 `Images` 工作表（架構討論階段列過的方案 C），務必重新檢視這條「讀取次數精簡原則」，需要比照 `Replies` 表的整批查詢設計，不能讓文章列表變成 N+1 讀取。
- Google Apps Script 的 `google.script.run` 單次請求大小限制，查證階段只找到開發者社群的實測數字（約 50MB），沒有 Google 官方文件明確記載這個數字；30MB 這個前端總量上限是在這個實測值之下留了安全邊界，如果之後想調整這個數字，建議先重新查證是否有更新的官方資訊。
- 過程中發現的既有隱藏 bug（LINE 彙整發文超過 3 張圖片時悄悄截斷丟棄）雖然是這輪改動附帶修正掉的，但如果之後要回溯統計「這個 bug 影響了多少篇既有文章」，目前的遷移工具不會處理這件事——遷移工具只轉換資料格式，不會嘗試從 LINE 端重新抓回當初被截斷丟棄的圖片（那些圖片本身可能已經不在 Drive 暫存區的可查詢範圍內）。
