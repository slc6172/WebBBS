# 06 — 回覆發表權限

**What to build:** 發表回覆動作依角色的「回覆發表」權限 + 該回覆所屬文章的看板 `AllowRoles` 決定允許或拒絕。

**Blocked by:** 01, 02

**Status:** done

- [x] 發表回覆動作依角色的「回覆發表」權限 + 該回覆所屬文章的看板 `AllowRoles` 決定允許或拒絕——`postReply.js` 的 `createReplyForRole`。這裡不需要額外處理 admin 特例，`boardAllowsRoleById`（ticket 03 做的）內部已經自己判斷 `role === 'admin'` 就直接放行，admin 在 `Permission` 表裡本來就是 `replyPost = true`，寫法比 05 單純，結構跟 04（發文）幾乎一樣
- [x] 沒有權限時，即使繞過前端直接呼叫後端函式，一樣被拒絕——新增測試涵蓋「目標看板 `AllowRoles` 排除該角色」與「articleId 不存在」兩種情境

