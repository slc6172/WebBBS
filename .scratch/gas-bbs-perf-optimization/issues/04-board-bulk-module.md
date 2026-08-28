# 04 — boardBulk.js 模組(看板批量資料組裝)

**What to build:** 新增一個模組,給定一個看板 ID 與頁次,一次讀出這一頁(依 `createdAt` 新到舊排序、依可調整的批次篇數上限切頁)文章的完整資料(標題、內文、圖片欄位等),以及這批文章底下對應的全部回覆(對 `Replies` 表做一次讀取後依 `articleId` 分組,不設回覆則數上限),並標示是否還有更舊的文章沒載入(`hasMore`)。這是純粹的新模組,不接線到 `Code.js` 或前端,不影響任何現有行為,可與 Ticket 01/02/03 平行進行。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] 提供一個函式,輸入 spreadsheet、`boardId`、`pageIndex`、`pageSize`,輸出 `{articles: [...含內文與圖片欄位], repliesByArticleId: {...}, hasMore: boolean}`——實作為 `boardBulk.js` 的 `getBoardBulkPage`
- [x] 篇數上限(`pageSize` 的預設值)是一個具名匯出常數,單一定義處,方便之後調整——`BOARD_BULK_PAGE_SIZE = 300`,呼叫端沒帶 `pageSize` 時使用這個預設值
- [x] 文章依 `createdAt` 新到舊排序後正確切頁:第 0 頁是最新的一批,篇數超過 `pageSize` 時 `hasMore` 為 true
- [x] `pageIndex` 超過實際頁數時,回傳空的文章陣列與 `hasMore: false`,不報錯
- [x] 這一頁涵蓋的每篇文章,其回覆正確分組在對應的 `articleId` 底下;不遺漏,也不會誤植到別篇文章名下
- [x] 完全沒有回覆的文章,`repliesByArticleId` 對應的 key 是空陣列,而不是缺漏這個 key
- [x] 只對這一頁涵蓋的文章讀取回覆(不屬於這一頁的文章,即使它們也有回覆,不影響這次回傳結果的正確性與大小)——`groupRepliesByArticleId_` 只把 `articleIds` 集合內的列組進結果,其餘列讀到但捨棄
- [x] `Replies` 表在這個函式一次呼叫內只被讀取一次(用 Ticket 01 的呼叫次數追蹤斷言),不論這一頁有幾篇文章——順手也加了一條對稱的 `Articles` 表只讀一次的斷言,雖然不是 ticket 明文要求,但同一輪優化的精神理應一致
- [x] 該看板完全沒有文章時,回傳空結構,不報錯
- [x] 這個新模組不被 `Code.js` 或任何既有讀取端點呼叫,現有全部測試維持全綠不受影響(57 檔/303 測試全綠,較 Ticket 03 完成時淨增 1 檔/10 測試)
