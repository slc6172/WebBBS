# 06 — @提及登入清單顯示

**What to build:** 使用者登入成功時，若過去累積了尚未顯示過的提及記錄，跳出一個小型視窗列出每一則（文章標題、看板名稱、提及者、時間），可以點擊直接導覽到該篇文章；提供「關閉」可以整批略過不點。這份清單顯示過一次就清空，不管使用者有沒有點開來看。清單為空時什麼都不顯示，不留任何常駐圖示。

**Blocked by:** 05（需要 05 建立的 `pendingMentions` schema 與寫入邏輯先存在）

**Status:** ready-for-agent

- [ ] `login.js` 的 `login()` 函式：密碼驗證通過後，讀出該使用者目前的 `pendingMentions` 內容，並在既有的登入寫回（`loginCount`／`lastLoginAt`）之外，額外對 `pendingMentions` 欄位做第二次、範圍只到這個欄位的 `setValues` 寫入，清空成 `'[]'`——維持「只寫真正變動的欄位」的既有原則，不合併成單一大範圍寫入去動到 `lastSeenBoards`／`articleCount`／`replyCount` 等其他欄位
- [ ] `login()` 的回傳值新增欄位，帶出清空前讀到的那份 `pendingMentions` 內容（供前端顯示）
- [ ] `getUserRecord_`（或等效的讀取邏輯）讀取範圍延伸到第 11 欄，取出 `pendingMentions` 原始 JSON 字串
- [ ] 前端登入成功後，若回傳的提及清單非空，彈出 modal 逐則列出「文章標題／看板名稱／提及者／時間」，每則可點擊，點擊後關閉 modal 並導覽到該篇文章（重用既有的文章開啟／深連結機制）；提供「關閉」按鈕可整批略過
- [ ] 提及清單為空時，不彈出任何視窗、也不留任何常駐圖示
- [ ] Node 測試：延伸既有 `login.test.js`，確認登入後 `pendingMentions` 被清空、回傳值正確帶出清空前的內容；確認 `lastSeenBoards`／`articleCount`／`replyCount` 等其他欄位在這次寫入後維持原值不被覆寫
- [ ] 前端顯示與導覽部分純 `Index.html` 邏輯，沒有對應的 Node 測試 seam；`MANUAL_VERIFICATION.md` 新增這張票的真人環境驗收項目（有提及/無提及兩種登入情境、點擊導覽、關閉按鈕、清空後下次登入不再顯示同一則）
