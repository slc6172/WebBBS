# 04 — 文章發表權限

**What to build:** 發表文章動作依角色的「文章發表」權限 + 目標看板的 `AllowRoles` 決定允許或拒絕，前端發文按鈕跟著動態顯示。

**Blocked by:** 01, 02

**Status:** done

- [x] 發表文章動作依角色的「文章發表」權限 + 目標看板的 `AllowRoles` 決定允許或拒絕——`postArticle.js` 的 `createArticleForRole`
- [x] 桌面版「+ 發表新文章」按鈕與手機版浮動 ➕ 按鈕，依「文章發表」權限動態顯示或隱藏——`getMyStatus` 新增 `canPostArticle` 欄位(只查全域權限，不查特定看板 `AllowRoles`；原因見下方說明)，`Index.html` 對應改用這個欄位。排行榜按鈕這次刻意不動，維持原本寫死的判斷，留給 ticket 08 處理
- [x] 沒有權限時，即使繞過前端直接呼叫後端發文函式，一樣被拒絕——新增測試涵蓋「目標看板 `AllowRoles` 排除該角色」與「boardId 根本不存在」兩種繞過情境

**一個簡化判斷,記錄一下原因**:`canPostArticle` 只查全域的 `articlePost` 權限,不對「目前選取的看板」額外查一次 `AllowRoles`。原因是 `AllowRoles` 是每個看板共用同一個值,同時控管讀取/發表/編輯刪除本人等 6 種板內動作——使用者能在下拉選單裡選到某個看板,就代表這個角色的 `articleRead` + 該看板 `AllowRoles` 已經通過,發文的 `AllowRoles` 檢查對同一個看板必然是同樣的結果,不需要在前端重複算。後端 `createArticleForRole` 送出當下還是會重新驗證目標看板的 `AllowRoles`,這個簡化只影響按鈕「要不要顯示」,不影響實際授權判斷。

