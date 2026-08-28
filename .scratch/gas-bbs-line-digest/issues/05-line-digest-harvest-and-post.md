# 05 — 分段門檻收割與彙整發文

**What to build:** 每個授權群組獨立計算分段門檻(圖片數 ≥3 或文字量 ≥8000 字元),達到門檻時把該群組當下暫存的所有內容整批彙整、依規則產生標題與排版內文,以 `SYSTEM` 身分張貼進對應看板,觸發看板既有的即時更新機制,並清空已彙整的暫存內容。這張不強制依賴 03/04——用純文字訊息就能餵到字數門檻、完整展示這條路徑;圖片門檻與收回註記在各自的 ticket 上線後會自然開始生效,不需要回頭改這張的程式碼。

**Blocked by:** 01, 02

**Status:** done

- [x] 新增常數:分段收割的圖片數量門檻 3、文字量門檻 8000 字元
- [x] 新增純函式 `shouldHarvest(state)`:輸入 `{imageCount, contentLength}`,回傳是否達到分段收割門檻(圖片數 ≥3 或文字量 ≥8000,任一即可)
- [x] 新增純函式 `hasResidualContent(state)`:輸入同上,回傳該群組是否還有尚未達到一般門檻、但換日時仍應被收割的殘餘內容(圖片數 >0 或文字量 >0)
- [x] 新增純函式 `buildDigestTitle(params)`:輸入 `{date, groupName, sequenceNumber, boardSharedByMultipleGroups}`;是否帶群組名稱、是否帶篇數序號是兩個獨立判斷——當天第 2 篇以上或看板被多群組共用時帶群組名稱,只有當天第 2 篇以上才加「(第N篇)」序號(spec 裡已經定案的邏輯,兩者不是綁在同一個條件)
- [x] 新增純函式 `formatDigestContent(messages)`:輸入 `{time, displayName, content}` 陣列,依時間排序後排版成每則訊息一行、格式為「`[HH:mm] 顯示名稱: 內容`」的文字;已收回的訊息內容應已在呼叫端被加上「(訊息已收回)」註記,這支函式本身不判斷收回與否
- [x] 新增純函式 `computeNextDigestSequence(lastDigestDate, todayDigestCount, today)`:換日時(`lastDigestDate` 不等於 `today`,含空字串的首次情況)回傳 1,否則回傳 `todayDigestCount + 1`;日期比對只需要單一分支(不需要防禦帶引號的形式——`lastDigestDate` 已經走跟 `createdAt` 一樣的強制純文字/單引號寫入慣例,讀回一律不含引號)
- [x] 新增 `harvestGroupDigest_(groupId, boardId, groupName)` 整合以上邏輯:讀取該群組的暫存內容 → 判斷所屬看板是否被多個群組共用 → 用 `computeNextDigestSequence` 算序號 → 用 `buildDigestTitle`/`formatDigestContent` 組標題與內文 → 呼叫 `createArticleUnlocked_` 寫入文章 → 刪除已彙整的暫存列 → 更新 `LineGroupBoards` 對應列的 `lastDigestDate`/`todayDigestCount`;整段流程全程只取用同一把 `LockService.getScriptLock()`,不在持鎖期間呼叫任何會自己另外取鎖的函式(不巢狀取鎖)
- [x] 文章成功建立、鎖已釋放之後,呼叫既有的 `bumpBoardVersion`/`bumpBoardActivity_`,行為與一般使用者發文完全一致,看板的新內容提示與前端即時更新機制能正確反映
- [x] 發文者固定為字串 `"SYSTEM"`,不建立對應的 `Users` 列,不佔用任何發文數排行榜或個人統計數字的名額;不透過 `createArticleForRole`,不受角色權限或 `AllowRoles` 限制
- [x] 每次訊息寫入 `LineStaging` 後,即時檢查該群組是否達到 `shouldHarvest` 門檻,達到就立即觸發 `harvestGroupDigest_`
- [x] 某群組當下完全沒有暫存內容時,不會被觸發收割、不會產生空文章
