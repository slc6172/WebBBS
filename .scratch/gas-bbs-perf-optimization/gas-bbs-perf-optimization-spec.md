status: ready-for-agent

# GAS BBS 效能優化 — 角色權限快取 + 看板批量預載

## Problem Statement

系統以 Google Sheets 當資料庫,每一次 `SpreadsheetApp` 的讀寫呼叫都要跨網路打到 Sheets 後端,延遲主要來自「呼叫次數」而不是「單次搬運的資料量」。目前架構在這個特性上吃了不小的虧:

- 角色與權限(`Users.role`、`Permission` 表 8 項權限旗標、`Boards.AllowRoles`)是「每一次操作都即時查表」的設計——切一次看板、開一篇文章,背後可能觸發 4~6 次獨立的表格讀取,其中還有明確的重複讀取(例如 `getArticleDetailFromToken` 一次執行內把 `Permission` 表讀了兩次)。
- 文章列表本身已經有版本戳快取機制(不重複讀),但點開一篇「這次頁面載入還沒開過」的文章,依然要付一次 `Articles` 全表掃描 + 一次 `Replies` 全表掃描的代價——而且 `listRepliesByArticle` 不管全站回覆總數多少,每開一篇新文章都要把整張 `Replies` 表重新掃過一輪,這個成本會隨著全站回覆數成長而越變越差,不會隨著使用者只看了幾篇文章而打折。
- 使用者實際的瀏覽行為(切看板、開文章、看回覆)遠比登入本身頻繁,但目前的角色/權限查驗沒有區分「這次頁面瀏覽期間有沒有變過」,每一次操作都當作全新情境重新查一輪。

## Solution

兩個方向同時做,原則是「以查一次、讀多量的方式換取更少的表格呼叫次數」,不改變任何使用者原本能做的操作或能看到的權限結果:

1. **角色/權限查驗快取**:使用者每次頁面載入或重新整理時,查一次角色、8 項權限旗標、以及目前可瀏覽的看板清單,存進 `CacheService`;同一次頁面載入期間,後續的讀取類操作(看板列表、文章列表、文章詳情)直接吃這份快取,不重新查表。寫入類操作(發文/編輯/刪除/回覆)不受影響,維持現況的每次即時查驗。
2. **看板批量預載**:使用者進入一個有權限的看板時,一次把最新一批文章(標題、內文、圖片欄位)連同這批文章底下的全部回覆一起讀回來,沿用既有的看板版本戳機制判斷「要不要真的重讀」。使用者在瀏覽器裡點開任何一篇文章、看任何一則回覆,都不再需要呼叫伺服器。看板文章數超過批次上限時,提供「載入更早的文章」的手動載入機制,同樣整批帶內文與回覆。

## User Stories

### 角色/權限查驗快取(讀取路徑)

1. As a 已登入使用者, I want 我的角色與權限在頁面載入/重新整理時查一次就好, so that 我在同一次瀏覽期間切換看板、開文章不會因為重複查表而變慢。
2. As a 已登入使用者, I want 我在同一次頁面瀏覽期間「可以瀏覽哪些看板」的清單,是登入/整理頁面當下就算好的, so that 切看板不用每次都重新判斷 `AllowRoles`。
3. As an admin, I want 我變更某使用者的角色或某看板的 `AllowRoles` 後,受影響的使用者只要重新整理頁面就能立即撿回最新設定,不需要重新輸入帳密登入, so that 我仍然有一個不用勞煩對方重新登入就能生效變更的管道。
4. As a 系統, I want 「查一次」的優化只套用在讀取類操作(看板列表、文章列表、文章詳情), so that 寫入操作(發文/編輯/刪除/回覆)仍然對每一次動作即時查驗角色與看板權限,被收回權限的使用者無法用快取期間內的舊權限造成新的、無法復原的內容異動。
5. As a 系統, I want 這份權限快取遺失或過期時(例如 `CacheService` 到期,或在極端情況下被容量上限提前清掉),讀取類操作安全地視為「沒有任何權限」, so that 不會有使用者在快取異常消失時意外看到不該看的內容,只要重新整理頁面就會恢復正常。
6. As a developer, I want 這份權限快取的實作不去更動現有 `session_<token>` → `userId` 這條既有寫入路徑一路依賴的資料形狀, so that 所有既有的 `*FromForm` 寫入函式完全不用改動就能繼續正常運作。
7. As a 已登入使用者, I want 我登出時,伺服器一併清掉這份權限快取(不只是清掉原本的 session token), so that 不會留下我登出後其實還有效的快取殘留。

### 看板批量預載(讀取路徑)

8. As a user/admin, I want 我進入一個有權限的看板時,系統一次把最新一批文章的標題、內文、圖片欄位,以及這批文章底下所有回覆都讀回來, so that 我接下來點開任何一篇文章、閱讀任何一則回覆,都不需要再等待伺服器回應。
9. As a user/admin, I want 我在同一次看板瀏覽期間重複點開同一篇文章、或前後切換不同文章,完全不會感覺到延遲。
10. As a user/admin, I want 我離開這個看板又切回來時,系統先做一次輕量的版本比對——沒有其他人異動過這個看板,就直接沿用我瀏覽器裡已經有的資料,不重新整批讀取。
11. As a user/admin, I want 我瀏覽期間有其他使用者在這個看板發表新文章或新回覆,只要我離開看板、切回來,或是我自己的寫入操作觸發版本更新,就能看到最新內容。
12. As a user/admin, I want 一個看板的文章數量超過系統設定的批次上限時,系統只先載入最新的一批,不會因為文章太多而讓進板速度變慢。
13. As a user/admin, I want 在文章列表最下方看到「載入更早的文章」按鈕,點擊後系統整批載入下一批更舊的文章(含內文與回覆),而不是要我一篇一篇點開才個別讀取。
14. As a user/admin, I want 已經載入過的批次不會因為我又點了「載入更早的文章」而被重新整批讀取一次(累加載入,不重複讀)。
15. As a user/admin, I want 一篇文章不管累積幾則回覆,批量載入所屬看板時都會把它的全部回覆一起帶出來,不因為回覆多就被截斷。
16. As a user/admin, I want 我拿到一則分享出來、指向一篇不在我目前已載入批次範圍內的舊文章連結時,系統依然能直接開啟該篇文章的完整內容與回覆,不用先把整個看板從頭批次載完。

### 效能與資料量控制

17. As a developer, I want 單次批量載入的文章篇數上限是一個可以調整的常數,不寫死在多處程式碼裡, so that 之後要調整這個數字只要改一個地方。
18. As a developer, I want 這個批量載入機制沿用既有的看板版本戳(`boardVersion`)機制做「有沒有變動」的判斷,而不是另外重新發明一套快取系統, so that 專案不會同時存在兩套彼此可能不同步的版本比對邏輯。

### 其他讀寫次數精簡(不改變任何行為)

19. As a developer, I want 同一次伺服器執行內,`Permission` 表跟 `Boards` 表不會被重複讀取, so that 讀取路徑的表格存取次數降到最低,不留下明顯的重複讀取。
20. As a developer, I want 發表回覆、刪除回覆這兩支寫入函式裡「找文章所屬看板」跟「找文章列號」這兩個原本各自獨立的全表掃描合併成一次, so that 這兩個寫入操作的表格存取次數也一併降到最低。
21. As a user/admin, I want 上述所有效能調整完全不影響我原本能做的任何操作與看到的任何權限結果, so that 這整輪改動對我來說只有「感覺變快」,沒有任何功能上的損失。

## Implementation Decisions

### 這輪對原始 spec 的修正聲明

原始 spec 的權限模型明文要求「角色即時查詢(不快取進 session),確保管理者變更權限後立即生效,無延遲空窗」(user story #13)。這輪**明確修正**這一條:讀取類操作改成「頁面載入/重新整理時查一次」,權限變更的生效時機從「下一次操作」放寬為「下一次頁面載入或重新整理」(不需要重新輸入密碼登入)。寫入類操作(發文/編輯/刪除/回覆)不受這條修正影響,維持原本的即時查驗,是刻意保留的安全邊界:即使受影響使用者在快取還沒更新前繼續瀏覽舊的權限範圍,也無法用這份舊快取去發表/編輯/刪除任何內容。

討論過改用簽章憑證(HMAC)讓瀏覽器自己攜帶已簽章的權限結果,評估後**不採用**——省下來的只是「再省一次已經很便宜的 CacheService 查詢」,但要多維護簽章密鑰、簽發/驗證邏輯與時鐘偏移處理,複雜度不划算,故採用 CacheService 存放快取這個較小改動的版本。

### 角色/權限快取(CacheService)

- 新增一個獨立的快取 key 命名空間(暫定前綴 `sessionPerm_`,搭配現有 token 組出 `sessionPerm_<token>`),值為 JSON:`{permissions: {...現有 8 項布林值}, allowedBoardIds: [...這個角色目前可瀏覽的看板 ID]}`。TTL 與現有 session token 一致(21600 秒/6 小時)。
- **刻意不更動**現有 `session_<token>` → `userId`(裸字串)這個既有 key 的資料形狀——寫入路徑(`postArticleFromForm`/`postReplyFromForm`/`editArticleFromForm`/`deleteArticleFromForm`/`deleteReplyFromForm`/`markBoardSeenFromToken`)全部繼續讀這個既有 key 取得 `userId`,並繼續各自即時查角色與 `AllowRoles`,完全不用改動。權限快取是另一把獨立的鑰匙,只有讀取類端點會去查。
- `permissions.js` 新增 `buildRoleSnapshot(spreadsheet, role)`:內部呼叫既有的 `getRolePermissions`(不變)與既有的 `getBoardsForRole`(不變,來自 `boards.js`,取其 `boardId` 清單),組出上述快取值的形狀。不新增 `boards.js` 的任何函式——`getBoardsForRole` 本來就已經是「這個角色能看哪些看板」的正確答案來源。
- `Code.js` 的 `getMyStatus` 在既有的即時查角色/權限之後,呼叫 `buildRoleSnapshot` 並把結果寫入 `sessionPerm_<token>`,TTL 同上;回傳給前端的內容維持現況不變(前端本來就已經拿得到 `permissions`,這裡只是「同時也存一份到伺服器端」)。
- `logoutFromForm` 除了現有的 `cache.remove(SESSION_PREFIX + token)`,一併 `cache.remove('sessionPerm_' + token)`。
- 讀取類端點(`getBoardsFromToken`/新的 `getBoardBulkFromToken`,見下方)改成:先 `cache.get('sessionPerm_' + token)`,有值就直接用來判斷權限與可瀏覽看板,不再呼叫 `getSessionRole`/`getRolePermissions`/`boardAllowsRoleById` 做即時查表;沒有值(未登入,或快取意外消失)一律視為沒有任何權限,回傳空結果——跟現有「role 為 null 時 `gateByRole` 自然拒絕」的既有 fail-safe 精神一致,不特別報錯。
- `getBoardsFromToken` 原本用來算「新文章/新回覆提示」的部分(`listBoards`、`getUserRecord_` 讀 `lastSeenBoards`)維持不變,不受這次快取影響——那些是即時變動的內容時間戳記,不是權限狀態,本來就不該被「查一次」的邏輯覆蓋。

### 看板批量預載

- 新增一個模組 `boardBulk.js`,是這輪唯一新增的可測試 seam:
  - `getBoardBulkPage(spreadsheet, boardId, pageIndex, pageSize)`:讀取 `Articles` 表裡屬於 `boardId` 的所有列(含 `content`/`imageUrl1~3`,不再跳過內文欄位),依 `createdAt` 新到舊排序,依 `pageIndex`/`pageSize` 切出這一頁的文章清單;取得這一頁涵蓋的 `articleId` 集合後,對 `Replies` 表做**一次**整表讀取,依 `articleId` 分組,只把屬於這一頁文章的回覆整理進回傳結果。回傳形狀 `{articles: [...含 content/imageUrl1~3], repliesByArticleId: {...}, hasMore: boolean}`。
  - 回覆不設則數上限,一篇文章有多少則回覆,批量時就整批帶出多少則(沿用既有 `listRepliesByArticle` 的行為,只是改成一次掃描服務多篇文章)。
  - `pageSize` 是一個匯出常數(暫名 `BOARD_BULK_PAGE_SIZE`),預設值 `300`,單一定義處,方便之後調整。
- `Code.js` 新增 `getBoardBulkFromToken(token, boardId, pageIndex, clientVersion)`,寫法比照現有 `getArticlesFromToken`/`getArticleDetailFromToken` 的既有慣例(gating + 版本比對 inline 寫在 Code.js,不另外包一層 `*ForRole` 模組函式):
  1. 從 `sessionPerm_<token>` 快取取得快照,`permissions.articleRead` 為 false 或 `boardId` 不在 `allowedBoardIds` 內,直接回傳空結果。
  2. 版本 key 沿用既有 `contentVersion.js` 的 `getBoardVersion`/`bumpBoardVersion`,**不新增任何函式**,只是把 key 組成 `boardId + ':page' + pageIndex`(頁與頁之間版本各自獨立,編輯/刪除很舊的一批文章不會讓最新一頁的版本跟著失效,反之亦然)。
  3. `clientVersion` 相符時回傳 `{unchanged:true, version}`;不符或沒有快取版本時呼叫 `getBoardBulkPage`,並用 `Utilities.getUuid()` 產生新版本寫回 cache,回傳 `{unchanged:false, version, articles, repliesByArticleId, hasMore}`。
- 現有 `getArticlesFromToken`(不含內文的列表版)、`getArticleDetailFromToken`(單篇文章詳情)**兩支都保留、不刪除**,做為深連結指到目前尚未載入批次範圍外的文章時的補讀端點——前端邏輯見下方。
- 前端(`Index.html`)改動:
  - 進入看板時呼叫 `getBoardBulkFromToken` 取代原本的 `getArticlesFromToken`;原本的 `boardArticleCache`/`articleDetailCache` 兩個各自獨立的快取物件,合併成一個以 `boardId` 為 key、內含 `{version, pages: [{articles, repliesByArticleId}], hasMore}` 的統一結構。
  - 點開版內任一篇文章、任一則回覆,一律從這個記憶體結構直接取用渲染,不呼叫任何伺服器端點。
  - 文章列表最下方,`hasMore` 為 true 時顯示「載入更早的文章」按鈕,點擊後以 `pageIndex + 1` 再呼叫一次 `getBoardBulkFromToken`,把回傳的新頁附加(append)進既有結構,不覆蓋掉已經載入的頁。
  - 深連結(`?board=xxx&article=xxx`)或使用者主動翻到很舊頁次點開的文章,如果不在目前已載入的頁面資料裡,改呼叫既有的 `getArticleDetailFromToken` 單篇補讀(這支函式與其既有的版本比對邏輯完全不變)。
  - 自己發文/編輯/刪文/回覆/刪回覆之後的樂觀本地更新(`patchArticleListOnCreate` 等既有函式)沿用既有寫法,只是作用的資料結構從兩個獨立物件變成統一結構裡對應頁次的那一份,行為不變。

### 其他讀寫次數精簡

- `getArticleDetailFromToken`(Code.js)目前的 `allowed` 判斷會呼叫 `getRolePermissions`,而它接著呼叫的 `getArticleDetailForRole` 內部又會再呼叫一次 `getRolePermissionsFor_`——這輪把這個重複讀取消掉的方式,是讓這支端點也改吃 `sessionPerm_<token>` 快取的 `permissions.articleRead`(跟看板批量預載端點的 gating 方式一致),不再各自獨立即時查表,順帶就把這個既有的重複 `Permission` 讀取消除了。
- `postReply.js` 的 `createReplyForRole` 目前呼叫 `findArticleBoardId_`(掃描 `Articles` A:B 兩欄)取得 `boardId` 做 `AllowRoles` 判斷,鎖定區間內的 `createReply` 又獨立呼叫 `findArticleRowNumber_`(掃描 `Articles` A 欄)找列號——這兩支合併成一個 `findArticleRowAndBoardId_`,一次讀取 A:B 兩欄同時取得列號與 `boardId`,結果分別提供給鎖外的 `AllowRoles` 判斷與鎖內的 `replyCount` 更新使用。
- `deleteReply.js` 的 `deleteReplyForRole`/`deleteReply` 有完全一樣的 `findArticleBoardId_`/`findArticleRowNumber_` 重複掃描,比照 `postReply.js` 的方式合併。
- 兩處合併都只影響內部實作,函式的對外簽章與回傳形狀不變,既有測試案例(給定角色/AllowRoles/文章是否存在等組合,驗證允許或拒絕)全部維持原樣可通過,不需要重寫既有測試的斷言方式。

## Testing Decisions

- 好的測試只驗證外部行為(給定角色快照/看板頁次/文章與回覆資料,回傳結果是否正確),不斷言內部呼叫了幾次 `getRange`。
- `boardBulk.js` 是這輪唯一的新模組,是測試重點:沿用既有 `test/doubles/fakeSpreadsheet.js` 測試替身,涵蓋:單頁篇數不超過 `pageSize` 時全部回傳且 `hasMore` 為 false;超過 `pageSize` 時正確切頁且 `hasMore` 為 true;`pageIndex` 大於實際頁數時回傳空陣列;某頁涵蓋的文章各自的回覆正確分組、不遺漏也不誤植到別篇文章;某篇文章完全沒有回覆時對應 key 是空陣列而不是缺漏這個 key;文章數為 0 的看板回傳空結構不報錯。
- `permissions.js` 新增的 `buildRoleSnapshot`:驗證回傳的 `permissions` 與既有 `getRolePermissions` 結果一致、`allowedBoardIds` 與既有 `getBoardsForRole` 回傳的 `boardId` 清單一致(等於是驗證這支函式正確委派給兩個既有、已測試過的函式,不需要重新驗證底層邏輯本身)。
- `postReply.js`/`deleteReply.js` 合併後的 `findArticleRowAndBoardId_`:文章存在時同時回傳正確的列號與 `boardId`;文章不存在時回傳 null;既有涵蓋這兩支函式對外行為(`createReplyForRole`/`deleteReplyForRole` 在各種角色/AllowRoles/ownership 組合下允許或拒絕)的測試案例全部維持不動,作為這次重構沒有破壞既有行為的回歸依據。
- `Code.js` 的 `getMyStatus`/`getBoardBulkFromToken`/`getArticleDetailFromToken`/`logoutFromForm` 這些接線與 `Index.html` 的批量快取結構、「載入更早的文章」按鈕、深連結補讀邏輯,延續本專案一貫慣例:GAS 專屬 API(`SpreadsheetApp`/`CacheService`/`HtmlService`)無法在 Node 環境模擬,走人工驗收(`MANUAL_VERIFICATION.md`),不強求自動化涵蓋。
- 回歸驗證:既有全部測試(目前 52 檔/268 測試)必須維持全綠,尤其是 `permissions.js`/`boards.js`/`postReply.js`/`deleteReply.js`/`articleDetail.js` 既有涵蓋的角色與 `AllowRoles` 各種組合案例,確認這輪的重構沒有改變任何權限判斷的結果。

## Out of Scope

- 簽章(HMAC)式的權限憑證——討論後確認不採用,原因見上方「這輪對原始 spec 的修正聲明」。
- 批量預載回覆的則數上限/截斷——確認不設,一篇文章多少則回覆就整批帶出多少則。
- 無限捲動自動載入下一批文章——確認採手動「載入更早的文章」按鈕,不做捲動自動觸發。
- 同一次看板瀏覽期間、沒有離開看板也沒有自己寫入任何內容的情況下,即時反映別人新發的文章/回覆(例如背景輪詢)——現況維持「切出去再切回來,或版本因寫入而更新」才會看到最新內容,這輪不改變這個既有行為模式。
- 調整 session token 本身的 TTL(`SESSION_TTL_SECONDS`,目前 6 小時)——維持不變,權限快取的 TTL 沿用同一個值,但兩者這次都不調整長度本身。
- `LINE` 群組摘要機器人(`lineBotGlue.js`/`harvestGroupDigest_`/`createArticleUnlocked_`)完全不受這輪影響——它本來就繞過整個權限系統,這輪的權限快取與批量預載都碰不到它,鎖(`LockService`)相關的既有慣例(避免巢狀取鎖、unlocked 核心 + 薄 wrapper)也不受影響、不需要改動。
- Cascade delete、admin 越權能力(編輯/刪除他人內容)等既有規則,這輪完全不變。
- 這輪工作對應的 `MANUAL_VERIFICATION.md` 驗收項目,待實作完成、使用者在真實環境測試後再另外補上(比照第三、四輪的既有慣例)。

## Further Notes

- 這是延續「LINE 機器人輪」之後的**第五輪**改動,建議 `/to-tickets` 拆成多張 vertical-slice ticket、逐張 `/tdd` 實作,而不是一次性的大改動;ticket 檔案建議延續既有慣例放在 `.scratch/gas-bbs-perf-optimization/issues/` 底下,編號從 01 重新起算,跟前面三輪(優化輪、權限系統輪、LINE 機器人輪)的編號都是各自獨立的系統。
- 這輪新增/修改的模組集中在:`permissions.js`(新增 `buildRoleSnapshot`)、`boardBulk.js`(全新模組)、`postReply.js`/`deleteReply.js`(內部合併重複掃描)、`Code.js`(`getMyStatus` 寫入快取、新增 `getBoardBulkFromToken`、`getArticleDetailFromToken` 改吃快取、`logoutFromForm` 一併清快取)、`Index.html`(進板批量讀取、統一快取結構、載入更早文章按鈕、深連結補讀邏輯)。`boards.js`/`articles.js`/`contentVersion.js`/`login.js` 這次**不需要新增或修改任何函式**,全部沿用既有的。
- 部署面:這輪只用到既有已經授權過的 `SpreadsheetApp`/`CacheService`,不新增 `UrlFetchApp`/`DriveApp`/`ScriptApp.newTrigger` 這類需要重新跳出授權畫面的服務呼叫,預期重新貼上部署時**不會**跳出新的權限請求畫面(跟第二輪新增 Drive 權限、第四輪新增 LINE 相關權限那兩次不同)。
- 這次改動明確修正了原始 spec 的 user story #13(見上方「這輪對原始 spec 的修正聲明」),建議之後有人接手這個專案讀原始 spec 時,直接參考這份文件的說明,不要以為原始 spec 那條「即時生效」的敘述依然完全成立。
- Sandbox 開發環境沒有 Google OAuth 存取權限,這次改動一樣需要使用者在真實 GAS 環境手動驗收,尤其是「權限變更後,重新整理頁面是否真的立即生效」「批量預載進板速度是否真的有感提升」這兩項是這輪最核心的驗收目標,單元測試本身驗證不到「感覺變快了」這件事,需要實測。
