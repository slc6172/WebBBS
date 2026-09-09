# 05 — @提及偵測與寫入

**What to build:** 使用者發表文章或回覆時，內容裡若有 `@userId` 且這個 userId 真實存在、而且他的角色對這篇文章/回覆所在的看板有讀取權限，就把一筆提及記錄寫進他自己的 `pendingMentions` 欄位。無效的候選（不存在的 userId、沒有該看板讀取權限、@自己）一律靜默略過，不報錯。一篇文章/回覆可以同時提及多個有效對象，各自獨立寫入。這張票只到「資料被正確寫入」為止，還不含使用者實際看到通知的介面（見票 06）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `schema.js` 的 `Users` 表定義新增第 11 欄 `pendingMentions`（JSON 陣列字串，空值標準表示法是 `'[]'`）
- [ ] 新模組（例如 `mentions.js`）提供：
  - 純函式：從一段文字中擷取候選 `@userId`（`@` 後接 4~20 個英數字或底線字元，與既有 `validateUserId` 格式規則一致；同一則內文重複提到同一人只算一次）
  - 純函式：把「提及者、看板、文章、文章標題、時間」組成單筆通知記錄
  - 純函式：把單筆通知記錄附加進既有的 `pendingMentions` JSON（比照 `updateLastSeenBoard` 的純函式模式）
  - 整合函式（依賴注入 `spreadsheet`，比照 `postArticle.js`/`postReply.js` 既有模式）：對每個候選 userId 做存在性檢查、角色對該看板的讀取權限檢查（重用 `boardAllowsRoleByIdFor_`／`getRolePermissionsFor_`）、排除提及者本人，通過的才寫入目標使用者那一列
- [ ] 寫入 `pendingMentions` 的讀取-修改-寫回段落，對「被提及使用者那一列」包一層短暫的 `LockService` 鎖，避免多人同時提及同一人時互相覆寫；鎖的範圍只到這個欄位的讀寫，不影響發文/回覆本身既有的鎖定行為
- [ ] `createArticleForRole`（`postArticle.js`）在文章送出成功後呼叫上述整合函式，掃描標題與內文
- [ ] `createReplyForRole`（`postReply.js`）在回覆送出成功後呼叫上述整合函式，掃描回覆內容
- [ ] `editArticleFromForm` 不掃描新增的 `@` 標記（範圍明確排除，避免要 diff 新舊內容）
- [ ] 寫入 `pendingMentions` 時不需要額外做公式注入跳脫（整欄值永遠以 `JSON.stringify` 產生、開頭固定是 `[`，不會被 Sheets 誤判成公式），內嵌的文章標題等使用者輸入內容不需要重複跳脫
- [ ] Node 測試：`@userId` 擷取邏輯（含格式不合法、重複提及等邊界情況）、附加/清空純函式邏輯、有效性過濾邏輯（存在性/權限/排除自己各自獨立測試）
- [ ] 延伸既有 `createArticleForRole.test.js`／`createReplyForRole.test.js`：送出含有效 `@userId` 的內容後，確認目標使用者那一列的 `pendingMentions` 被正確寫入；無效/無權限/自我提及情境下確認完全不寫入
