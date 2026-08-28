# 05 — 看板批量預載端點與前端串接(單頁)

**What to build:** 新增一個讀取端點,使用者進入一個有權限的看板時,一次把最新一批文章(標題、內文、圖片、回覆)整批讀回瀏覽器;沿用既有的看板版本戳機制(依 `boardId` + 頁次組出各自獨立的版本 key),版本沒變就直接沿用瀏覽器裡已有的資料,不重新整批讀取。前端進入看板時改呼叫這支新端點,並把資料存進一個統一的、按看板/頁次組織的記憶體快取結構;使用者點開版內任何一篇文章、看任何一則回覆,直接從這個結構取用渲染,不再呼叫伺服器。這張刻意先不處理超過批次上限的情況——如果一個看板文章數超過批次上限,這張 ticket 交付後使用者這次只會看到最新的一批,更舊的文章要等 Ticket 06 補上「載入更早的文章」才看得到。

**Blocked by:** 03 — 角色/權限快取(讀取路徑)、04 — boardBulk.js 模組

**Status:** ready-for-agent

- [x] `Code.js` 新增端點,輸入 token、`boardId`、頁次、使用者端已知的版本值:先用 Ticket 03 的權限快取判斷這個角色能不能讀、這個看板是否在允許清單內,不通過時回傳空結果——實作為 `getBoardBulkFromToken`,順手新增 `permissions.js` 的 `snapshotAllowsBoardArticleRead`(`articleRead` AND 看板成員兩者合一的判斷),`getBoardsFromToken` 也一併改用這個函式,消除原本兩處重複寫同一個判斷式的情況
- [x] 通過權限判斷後,依既有版本戳機制比對版本:版本相符時回傳「沒有變動」,不呼叫 Ticket 04 的模組重新整批讀取——版本 key 用 `boardId + ':page' + pageIndex`,完全沿用 `contentVersion.js` 既有的 `getBoardVersion`/`bumpBoardVersion`,沒有新增或修改那個檔案
- [x] 版本不符或使用者第一次進這個看板這一頁時,呼叫 Ticket 04 的模組整批讀取,產生新版本並回傳資料與新版本值
- [x] 前端進入一個看板時,改呼叫這支新端點取代原本只取列表(不含內文)的既有呼叫——**範圍決定**:原本的 `getArticlesFromToken`(Code.js)與其底層的 `articles.js`(`getArticlesForRole`/`listArticlesByBoard`,兩者都有完整既有測試覆蓋)保留、不刪除,只是前端不再呼叫。刪除 `getArticlesFromToken` 會連帶讓 `articles.js` 這兩個函式變成完全沒有生產程式碼呼叫,等於要一併刪掉一整個已測試模組——這超出這張 ticket 的範圍,故保留為未使用但正確的既有程式碼,不強行做非必要的級聯刪除
- [x] 前端把回傳的文章與回覆存進一個以看板/頁次為結構的記憶體快取,取代原本兩個各自獨立的文章列表快取與文章詳情快取——`boardArticleCache`/`articleDetailCache` 合併成 `boardBulkCache`(`{pages: [{version, articles, repliesByArticleId}], hasMore}`),`findCachedArticleLocation_` 統一查找邏輯
- [x] 使用者點開版內任一篇文章,直接從這個記憶體快取渲染標題、內文、圖片,不呼叫伺服器
- [x] 使用者點開任一則回覆(或展開回覆區),直接從這個記憶體快取渲染,不呼叫伺服器
- [x] 使用者離開這個看板、再切回來時,前端帶著已知版本值再呼叫一次這支端點:版本沒變就直接沿用記憶體裡的舊資料,不整批重讀
- [x] 自己發文/編輯/刪文/回覆/刪回覆後的既有樂觀本地更新邏輯,改成作用在這個新的統一記憶體結構上,行為(畫面立即反映自己的變動)與現況一致——**實作時發現的必要修正**:五個既有寫入端點(`postArticleFromForm`/`editArticleFromForm`/`deleteArticleFromForm`/`postReplyFromForm`/`deleteReplyFromForm`)原本只會 bump 舊的 `boardVersion_<boardId>`/`articleVersion_<articleId>` 這兩組 key,不會動到這張 ticket 新用的 `boardVersion_<boardId>:page0` key(字串不同、CacheService 裡是完全不同的條目)。如果不修正,「別人異動後,我離開再切回來版本比對能抓到變化」這件事就會失效——同版的其他使用者離開再切回來時,伺服器端 `:page0` 版本值其實從沒被寫入端點動過,版本比對會一直誤判成「沒有異動」,看不到別人新發的文章/回覆。已在五個端點各自成功時,補上對 `boardId + ':page0'` 的 `bumpBoardVersion` 呼叫(四個已經在既有程式碼裡查過 `boardId`,直接重複使用,不需要多查表;只有 `deleteReplyFromForm` 原本沒查過,補了一次 `getArticleById`,跟 `postReplyFromForm` 既有的查法一致)。這是這張 ticket 範圍內的必要修正,不是分頁(ticket 06)的提前施工——目前只有 `:page0`,編輯/刪除目標文章如果在未來 ticket 06 的第二頁以後,要 bump 哪一頁的版本是 ticket 06 需要重新考慮的問題,已在程式碼註解點出
- [x] 這張 ticket 交付後,看板文章數不超過批次上限時,使用者體驗到的功能與現況完全一致(看得到全部文章、全部回覆),只是變快;超過上限的情況下,先只看得到最新一批,不會出現錯誤或空白畫面——同時修正了一個實作時發現的既有 race condition:原本深連結(`?article=`)在 `loadBoards` 的成功回呼裡,跟 `loadArticles`(非同步)幾乎同時觸發 `selectArticle`,舊架構下沒差(`selectArticle` 自己會獨立呼叫伺服器);新架構下 `selectArticle` 改成只查本地快取,若快取還沒到位會找不到文章。改成 `openDeepLinkedArticleIfPending()`,在 `loadArticles` 的批量資料真正回來之後才觸發,確保先後順序正確;找不到的情況(深連結指到不在第一頁範圍內的舊文章)顯示「不存在」,不當機、不空白,交給 ticket 07 補上正式 fallback
