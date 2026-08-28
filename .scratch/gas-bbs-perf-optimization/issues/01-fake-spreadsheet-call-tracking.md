# 01 — 測試替身支援讀取呼叫次數追蹤

**What to build:** `test/doubles/fakeSpreadsheet.js` 這個測試替身,能記錄某張分頁(sheet)在一次操作過程中被讀取(`getRange`/`getDataRange` 等既有讀取路徑)的次數,讓測試可以直接斷言「這次操作總共讀了幾次某張表」。這是純粹的測試基礎建設,不改變任何產品程式碼的行為,是後面兩張「去重」ticket(02、03)能寫出可驗證斷言的前提。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `fakeSpreadsheet` 建立時提供一個可以查詢的呼叫紀錄(例如某種 `getReadCount(sheetName)` 或等價介面),回傳指定分頁被讀取的次數 —— 實作為 `sheet._getReadCount()`,比照既有 `_getNumberFormatCalls()`/`_getDataValidationCalls()` 的底線前綴慣例,掛在每個 sheet 物件上
- [x] 呼叫次數的計算方式明確定義且有測試涵蓋:同一個 `Sheet` 物件被拿到後,對它呼叫一次 `getRange(...).getValues()`(或 `.getRawValues()`)算一次讀取,不依 cell 數量或欄位數量計次;`getRange()` 本身、以及所有寫入操作(`appendRow`/`setValues`/`setNumberFormat`/`setDataValidation`)都不計入
- [x] 這個新能力預設不影響任何既有測試——完整測試套件維持全綠(53 檔/274 測試,較改動前淨增 1 檔/6 測試)
- [x] 至少寫一組新的測試,驗證這個追蹤機制本身是正確的——新增 `test/doubles/fakeSpreadsheet.test.js`,6 個測試涵蓋:初始值為 0、`getValues()` 計數、多次呼叫累加且不受 range 大小影響、`getRawValues()` 也計數、寫入操作不計數、不同 sheet 互相獨立計數
- [x] 在專案既有的測試撰寫慣例文件或範例測試裡(如果有的話)簡單補充這個新能力的用法,方便後續 ticket 直接引用——已在 `README.md` 的「開發」段落補充一段說明
