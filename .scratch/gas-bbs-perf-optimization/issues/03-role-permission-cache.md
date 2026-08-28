# 03 — 角色/權限快取(讀取路徑)

**What to build:** 使用者登入或重新整理頁面時,系統查一次角色、8 項權限旗標、以及這個角色目前可瀏覽的看板清單,存進伺服器端的 session 快取;登出時這份快取一併清除。看板列表(`getBoardsFromToken`)與文章詳情(`getArticleDetailFromToken`)這兩個既有的讀取端點,改成讀這份快取來判斷「這個使用者能不能看」,不再各自即時查 `Users`/`Permission`/`Boards` 表。對使用者來說:同一次頁面瀏覽期間切看板、開文章明顯變快;管理者變更某人的角色或某看板的 `AllowRoles` 後,受影響的使用者只要重新整理頁面就會立即撿回最新設定,不需要重新登入。發表文章、編輯/刪除文章、發表/刪除回覆這些寫入操作完全不受影響,維持現況的每次即時查驗。

**Blocked by:** 01 — 測試替身支援讀取呼叫次數追蹤

**Status:** ready-for-agent

- [x] `permissions.js` 新增一個函式,給定角色,組出 `{permissions: {...8 項既有布林值}, allowedBoardIds: [...]}`,內部透過既有的 `getRolePermissions` 與既有的 `getBoardsForRole` 組成,不重新實作任何底層判斷邏輯——**位置修正**:實際放進 `boards.js`(`buildRoleSnapshot`),不是 `permissions.js`,因為 `boards.js` 已經 `require('./permissions')`,兩者依賴方向本來就是單向;放進 `permissions.js` 會製造循環引用。`permissions.js` 改放一個更小的純函式 `snapshotIncludesBoard(snapshot, boardId)`,純粹的看板成員判斷、不綁定任何特定權限旗標,讓不同呼叫端各自 AND 自己需要的旗標
- [x] `getMyStatus` 在既有的即時查角色/權限之後,把上述結果寫入一個新的、獨立於現有 `session_<token>` 的快取 key,TTL 與現有 session token 一致;回傳給前端的內容維持現況不變
- [x] 登出(`logoutFromForm`)除了清除現有的 session token 快取,一併清除這個新的權限快取 key
- [x] `getBoardsFromToken` 的權限判斷改成讀這份快取,不再呼叫既有的即時查表路徑;「新文章/新回覆提示」用到的看板活動時間戳與使用者已讀紀錄維持現況即時讀取,不受這次改動影響
- [x] `getArticleDetailFromToken` 的權限判斷改成讀這份快取;找到文章實際所屬 `boardId` 後,用快取裡的 `allowedBoardIds` 做比對,不再對 `Boards`/`Permission` 表額外即時查詢——實作時發現原本的 `getArticleDetailForRole`(唯一呼叫端只有 `Code.js`)無法簡單原地改造:它內部把「文章讀權限」跟「看板允許」兩者合併判斷,直接複用會讓「只有 replyRead、沒有 articleRead」的角色錯誤地連回覆也讀不到(這個組合原本應該要能讀回覆)。改成新增 `getArticleDetailForSnapshot` 取代它,`articleRead`/`replyRead` 各自獨立跟 `snapshotIncludesBoard` 的結果做 AND,行為才跟原本一致;舊的 `getArticleDetailForRole` 與其 6 個測試已移除(6 個既有情境已原封不動搬進新函式的測試,另外多加了「從不讀 Boards/Permission 表」的斷言)
- [x] 快取不存在(未登入,或極端情況下快取被提前清除)時,上述兩個端點安全地視為「沒有任何權限」,回傳空結果,不報錯
- [x] 發表文章、編輯/刪除文章、發表/刪除回覆這些既有的寫入端點,程式碼與行為完全不變,持續每次即時查角色與 `AllowRoles`(不讀這份新快取)
- [x] 既有涵蓋角色與 `AllowRoles` 各種組合的權限判斷測試全部維持不動且全部通過(56 檔/293 測試全綠,較 Ticket 02 完成時淨增 3 檔、14 測試——含 1 個因為上述修正而整批替換的檔案),確認這次改動沒有改變任何允許/拒絕的結果,只是判斷資料的來源從即時查表變成讀快取
