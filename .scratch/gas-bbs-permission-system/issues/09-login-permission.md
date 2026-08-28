# 09 — 登入權限

**What to build:** 密碼驗證通過後，額外檢查該角色的「登入」權限，被擋下時的錯誤訊息跟密碼錯誤完全一樣，且不佔用現有的失敗鎖定計數。目前三個角色登入權限皆為 TRUE，這張完成後現有帳號的登入行為應維持不變，是為未來的停權角色預先鋪路。

**Blocked by:** 01

**Status:** done

- [x] 密碼驗證通過後，額外檢查該角色的「登入」權限——`login.js` 新增本地函式 `roleAllowsLogin_`(見下方說明,沒有透過 `permissions.js`)
- [x] 登入權限不通過時，回傳的錯誤訊息與密碼錯誤時完全相同，不透露帳密其實正確、只是角色被擋
- [x] 登入權限不通過的這次嘗試，不計入現有「15 分鐘內失敗 5 次鎖定帳號」的計數
- [x] `newbie`/`user`/`admin` 三個角色目前登入權限皆為 TRUE，此張完成後這三個角色的登入行為維持不變（既有測試全部維持通過）

**架構決策記錄**：原本預期會直接呼叫 `permissions.js` 的 `getRolePermissions`，但發現 `permissions.js` 已經反過來依賴 `login.js`（靠 `getUserRecord_`/`SESSION_PREFIX` 實作 `getSessionRole`，是更早一輪的既有架構）。`login.js` 如果再 `require('./permissions')` 會形成循環依賴，Node 對循環 require 的處理方式取決於「哪個檔案先被載入」，不同測試檔案的載入順序可能導致其中一邊拿到半成品的 `module.exports`，是很難排查的潛在地雷。最後選擇不動既有的依賴方向，`login.js` 自己刻一個小的本地函式 `roleAllowsLogin_` 直接讀 `Permission` 表的 `login` 欄，跟 `getRolePermissions` 有一小段邏輯重複，但這跟 `postReply.js`/`deleteReply.js` 各自獨立實作 `findArticleBoardId_`、不共用同一份的既有取捨一致。

