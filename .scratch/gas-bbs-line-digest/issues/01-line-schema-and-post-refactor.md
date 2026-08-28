# 01 — LINE 對話紀錄基礎建設:schema + 發文核心重構

**What to build:** 新增 `LineGroupBoards`(群組白名單兼群組對看板對應表)與 `LineStaging`(彙整前暫存區)兩張工作表的 schema 定義,並把既有 `postArticle.js` 的 `createArticle` 拆出一個不上鎖的核心版本。這張本身不改變任何使用者看得到的行為,是後續所有 LINE 相關 ticket 的共用地基,靠單元測試驗證正確性。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `schema.js` 的 `SHEET_HEADERS` 新增 `LineGroupBoards`(欄位:`groupId`/`groupName`/`boardId`/`lastDigestDate`/`todayDigestCount`)與 `LineStaging`(欄位:`groupId`/`messageTime`/`displayName`/`messageType`/`content`/`webhookEventId`/`recalled`)兩個工作表定義,`ensureSchema` 首次執行時自動建立、標題列正確,重複執行不重複建立、不覆寫既有資料列
- [x] `TIMESTAMP_COLUMNS` 新增 `LineGroupBoards: [4]`(`lastDigestDate`)、`LineStaging: [2]`(`messageTime`),寫入時強制純文字格式,比照既有 `createdAt`/`editedAt` 欄位的處理方式;這兩張表不需要額外的種子資料邏輯(不像 `Permission` 表,這兩張表本來就該是空的,等待管理者手動維護)
- [x] `postArticle.js` 新增 `createArticleUnlocked_(spreadsheet, input)`,內容是原本 `createArticle` 裡「取鎖之後」的寫入邏輯(寫入 `Articles` 新列 + 呼叫 `incrementUserStat`),不含標題/內文驗證、不含取鎖與放鎖
- [x] `createArticle(spreadsheet, lock, input)` 改寫成「驗證 → 取鎖 → 呼叫 `createArticleUnlocked_` → 放鎖」的薄 wrapper,對外的參數、回傳值、行為(驗證失敗訊息、formula injection escape、`createdAt` 強制純文字)完全不變
- [x] `createArticleForRole` 不需要任何修改,既有的角色權限 + `AllowRoles` 兩層檢查邏輯不變
- [x] 既有 `createArticle`/`createArticleForRole` 的測試檔不需要修改,原封不動全部通過
- [x] `createArticleUnlocked_` 有自己的單元測試(注入 `fakeSpreadsheet`,不需要注入 lock),驗證確實寫入正確欄位並觸發 `incrementUserStat`
