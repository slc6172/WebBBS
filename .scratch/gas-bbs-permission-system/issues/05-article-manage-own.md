# 05 — 文章編輯/刪除（本人）權限

**What to build:** 一般角色只能編輯/刪除自己發表的文章，依「文章編輯刪除（本人）」權限 + 本人 + 該看板 `AllowRoles` 三個條件；admin 繼續能編輯/刪除任何人的文章，這個能力維持寫死判斷，不受 `Permission` 表或 `AllowRoles` 影響。

**Blocked by:** 01, 02

**Status:** done

- [x] 一般角色編輯/刪除文章時，需同時符合：該角色的「文章編輯刪除（本人）」權限為真、該文章作者是自己、該看板的 `AllowRoles` 允許——`editArticle.js`/`deleteArticle.js` 的 `editArticleForRole`/`deleteArticleForRole`
- [x] admin 角色編輯/刪除任何人的文章不受上述三項限制，維持現有行為不變（程式碼中對 admin 角色的字面判斷，不查 `Permission` 表也不查 `AllowRoles`）
- [x] 文章的編輯/刪除按鈕依上述規則動態顯示（admin 一律顯示；一般角色僅在有權限且是本人文章時顯示）——`getMyStatus` 新增 `canManageOwnArticle`，一併修掉 `Index.html` 原本 `canManageArticle` 只看本人、沒查權限的既有漏洞（過去被「能發文的角色剛好都有編輯刪除本人權限」這個巧合蓋住，這次角色可自訂後才會真的露餡）
- [x] 沒有權限時，即使繞過前端直接呼叫後端函式，一樣被拒絕——新增測試涵蓋「目標看板 `AllowRoles` 排除該角色」與「角色沒有 `articleManageOwn` 權限即使看板允許」兩種情境

**實作細節記錄**：文章的 `boardId` 沒辦法像 ticket 04 一樣直接當參數拿到，只有 `articleId`，要查 `AllowRoles` 得先把文章列讀出來。非 admin 情況下，`*ForRole` 這層會多讀一次文章列確認 `boardId` 通過 `AllowRoles`，核心函式（`editArticle`/`deleteArticle`）之後還是會再讀一次——admin 情況完全不受影響，維持只讀一次。這個小重複讀取只發生在編輯/刪除這種低頻動作，不是被版本快取保護的高頻讀取路徑，判斷可以接受。

