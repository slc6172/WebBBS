# 01 — Permission 權限表基礎建設

**What to build:** 新增 `Permission` 工作表,把「有哪些角色、每個角色有哪 8 種權限」變成可以在 Google Sheets 裡編輯的資料,取代現在散落在各檔案裡的寫死角色陣列。這張本身不改變任何使用者看得到的行為,是後續所有權限相關 ticket 的共用地基,靠單元測試驗證正確性。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `Permission` 工作表加入 schema 定義,欄位為 `role` + 8 個布林值權限欄:文章讀、文章發表、文章編輯刪除(本人)、回覆讀、回覆發表、回覆刪除(本人)、排行榜、登入
- [x] 首次建立(工作表完全沒有資料列)時自動寫入三列預設值:`newbie`(僅「登入」為 TRUE,其餘 7 項 FALSE)、`user`(8 項全部 TRUE)、`admin`(8 項全部 TRUE)
- [x] 只要工作表已經有任何資料列(不論內容為何),重複執行都不再寫入或覆寫任何一列,只有表頭本身維持既有的每次覆寫行為
- [x] 有一支函式能依角色查出該角色完整的權限狀態(8 項布林值)——`permissions.js` 的 `getRolePermissions(spreadsheet, role)`;單一權限的查詢就是對回傳物件取對應欄位(`getRolePermissions(ss, role).articleRead`),確認過不需要再另外做一支只查單一權限的函式,兩者是同一個 seam
- [x] 角色不存在於 `Permission` 表時,一律回答不允許,不拋出例外
- [x] `Users` 工作表的 `role` 欄位加上資料驗證下拉選單,選項來源是 `Permission` 表目前的角色清單——`ensureSchema` 新增可選的第二參數 `buildRoleValidationRule`,真正的 `SpreadsheetApp.newDataValidation()` 呼叫留給 `Code.js` 注入,維持這個檔案不直接碰 GAS 全域物件的既有慣例
- [x] 現有的 `gateByRole` 原始函式與其既有測試維持不變、全部通過

