# 07 — 回覆刪除（本人）權限

**What to build:** 一般角色第一次能刪除自己發表過的回覆——這是全新能力，現有規則是任何人都不能刪自己的回覆，只有 admin 能刪。依「回覆刪除（本人）」權限 + 本人 + 該看板 `AllowRoles`；admin 繼續能刪除任何人的回覆，維持寫死判斷。

**Blocked by:** 01, 02

**Status:** done

- [x] 回覆刪除函式新增本人身份判斷（比對回覆作者與目前登入者），取代現有「僅 admin 可刪、完全不檢查作者」的規則——`deleteReply.js` 核心函式新增 `requestingUserId`/`isAdmin` 參數，寫法比照 `deleteArticle.js`
- [x] 一般角色刪除回覆時，需同時符合：該角色的「回覆刪除（本人）」權限為真、該回覆作者是自己、該回覆所屬文章的看板 `AllowRoles` 允許
- [x] admin 角色刪除任何人的回覆不受上述三項限制，維持現有行為不變
- [x] 回覆的刪除按鈕依上述規則動態顯示（admin 一律顯示；一般角色僅在有權限且是本人回覆時顯示）——`getMyStatus` 新增 `canDeleteOwnReply`，`Index.html` 的 `canDeleteReply` 從「整個畫面共用一個值」改成在回覆迴圈內逐則判斷（因為一般角色只能刪自己那幾則，不是全部或全無），`Code.js` 的 `deleteReplyFromForm` 補上原本沒有的 `requestingUserId` 取值
- [x] 回覆編輯功能不在本次範圍內，沒有新增任何編輯回覆的介面或函式

