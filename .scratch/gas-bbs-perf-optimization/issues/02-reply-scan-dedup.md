# 02 — 發表/刪除回覆:合併重複的文章表掃描

**What to build:** 發表回覆(`postReply.js`)與刪除回覆(`deleteReply.js`)這兩個既有操作,目前各自獨立呼叫一次「找這篇文章屬於哪個看板(`findArticleBoardId_`)」跟一次「找這篇文章在 `Articles` 表的第幾列(`findArticleRowNumber_`)」,兩者本質上是對同一張表、同一個 `articleId` 做兩次獨立掃描。這張 ticket 把兩者合併成一次讀取(例如 `findArticleRowAndBoardId_`,一次讀出列號與 `boardId`),分別供鎖外的 `AllowRoles` 判斷與鎖內的 `replyCount` 更新使用。對使用者來說,發表/刪除回覆的允許或拒絕結果完全不變,只是伺服器內部少讀一次表。

**Blocked by:** 01 — 測試替身支援讀取呼叫次數追蹤

**Status:** ready-for-agent

- [x] `postReply.js` 的 `createReplyForRole`/`createReply` 對同一個 `articleId`,同一次執行內對 `Articles` 表最多只讀取一次(用 Ticket 01 新增的呼叫次數追蹤斷言)
- [x] `deleteReply.js` 的 `deleteReplyForRole`/`deleteReply` 同上,對 `Articles` 表最多只讀取一次(admin 與非 admin 兩條路徑都涵蓋)
- [x] 合併後的查詢函式同時正確回傳列號與 `boardId`,兩者資料來源一致——實作時多發現一個當初沒算進去的重複讀取:更新 `replyCount` 前還要讀一次目前的值,合併後的 `findArticleInfoForReply_` 一次讀 A:I 欄,連 `replyCount` 也一起帶出來,所以最後做到的是「整個操作只讀一次」,不只是「找列號跟找 boardId 那兩個各自的讀取合併」
- [x] 文章不存在時,合併後的函式回傳明確的「找不到」結果,呼叫端依此拒絕操作,行為與合併前一致
- [x] 既有涵蓋「不同角色 × 該看板 `AllowRoles` × 文章是否存在」各種組合、驗證允許或拒絕結果的測試案例全部維持不動且全部通過(53 檔/279 測試全綠,較 Ticket 01 完成時淨增 5 測試),做為這次重構沒有改變任何權限判斷結果的回歸依據
- [x] 合併後的函式對外的回傳形狀清楚,呼叫端不需要額外重新查表就能拿到列號、`boardId`、`replyCount` 三項資訊——**與原本 ticket 描述的一個修正**:原本設想「鎖外讀一次、結果沿用到鎖內」,實作時發現這樣不安全(鎖外讀到的列號,如果在搶到鎖之前剛好有併發的刪除文章操作把列往上位移,鎖內沿用舊列號會扣錯篇文章的 `replyCount`)。改成把 `AllowRoles` 的判斷也搬進鎖內,跟找列號合併成同一次讀取,兩者都在鎖內完成——`postReply.js` 讓 `createReplyForRole` 不再委派給 `createReply`,`deleteReply.js` 則沿用專案既有的 `xxxUnlocked_`(比照 `postArticle.js` 的 `createArticleUnlocked_`)慣例,新增 `deleteReplyUnlocked_` 給 `deleteReply` 與 `deleteReplyForRole` 共用,兩者都只在各自最外層呼叫一次 `lock.waitLock()`,避免巢狀取鎖
