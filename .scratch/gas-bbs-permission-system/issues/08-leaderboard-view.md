# 08 — 排行榜檢視權限

**What to build:** 查看排行榜依角色的「排行榜」權限決定允許或拒絕，跟看板無關，不查任何看板的 `AllowRoles`。

**Blocked by:** 01

**Status:** done

- [x] 查看排行榜動作依角色的「排行榜」權限決定允許或拒絕，不查任何看板的 `AllowRoles`——新增 `leaderboard.js` 的 `getLeaderboardForRole`（延續 04~07 建立的 `*ForRole` 慣例，把原本只寫在 `Code.js`、沒有測試覆蓋的權限判斷搬進 `src/*.js`，這樣排行榜的權限邏輯也有獨立測試）
- [x] 排行榜按鈕依「排行榜」權限動態顯示或隱藏，與發文按鈕（ticket 04）各自獨立判斷，不再共用同一個條件式——`getMyStatus` 新增 `canViewLeaderboard`，`Index.html` 接上（ticket 04 那時特地留著沒動的那一半，這次補上）
- [x] 沒有權限時，即使繞過前端直接呼叫後端函式，一樣被拒絕

