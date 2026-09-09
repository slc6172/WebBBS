# 01 — 未讀文章與新回覆徽章

**What to build:** 使用者進入一個以前來過的看板時，文章列表要能一眼看出：(a) 哪幾篇是上次來訪之後新發的文章，(b) 哪幾篇「已經來過但這篇還沒點開過」的文章，之後有了新回覆。點開某篇文章之後，這篇文章對應的徽章要立刻消失（本地狀態即可，不需要伺服器往返）。使用者第一次進某個看板時，不顯示任何未讀/新回覆標記（避免舊看板整片洗版）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `getBoardsFromToken`（Code.js）針對每個看板，除了既有的 `hasNewArticle`／`hasNewReply` 布林值之外，額外回傳該使用者這個看板的原始 `lastSeenBoards[boardId]` 時間戳字串（沒來過時回傳空字串），不新增任何 Sheets 讀取，不改動 `boardActivity.js` 裡任何既有函式
- [ ] 前端把上述時間戳，跟 `boardBulkCache` 裡已載入文章的 `createdAt`、以及每篇文章底下每則回覆的 `createdAt` 做字串比對
- [ ] 時間戳為空字串（從沒來過這個看板）時，該看板底下完全不顯示任何未讀／新回覆標記
- [ ] 文章 `createdAt` 晚於時間戳 → 該文章視為新文章，標題前顯示一個小型「N」徽章
- [ ] 文章本身不是新文章、但底下至少一則回覆的 `createdAt` 晚於時間戳 → 在該文章既有的 💬 回覆數量前面顯示同樣的「N」徽章（例如「N💬12」）；文章本身已是新文章時不重複顯示這個回覆維度的徽章
- [ ] 徽章字級可視 36px 單行版面的空間縮小（約 0.65rem），不能造成文字換行或擠壓
- [ ] 使用者點開某篇有徽章的文章後，該文章（及其回覆維度）的徽章立刻在前端移除，不需要呼叫 `markBoardSeenFromToken` 或任何其他伺服器函式
- [ ] 延伸既有 `boardActivity.test.js`（或等效測試檔）驗證 `getBoardsFromToken` 新增欄位的行為，含「從沒來過」回傳空字串的邊界情況
- [ ] `MANUAL_VERIFICATION.md` 新增這張票對應的真人環境驗收項目（前端比對、徽章顯示、開啟即消失、首次進板不顯示，這幾項是純 `Index.html` 邏輯，沒有對應 seam，只能人工驗證）
