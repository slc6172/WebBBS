# 06 — 每日換日檢查與 trigger 安裝

**What to build:** 每日 00:05(Asia/Taipei)自動檢查每個授權群組是否有前一天未達門檻的殘餘對話內容,有則收割送出當天最後一篇;完全沒有對話的群組當天不發文。提供一次性的安裝函式建立這個 trigger,且重複執行不會建立出多個重複的 trigger。

**Blocked by:** 05

**Status:** done

- [x] 新增 `dailyLineDigestCheck()`:逐一走訪 `LineGroupBoards` 每一列,用 `hasResidualContent` 判斷該群組是否有殘餘暫存內容,有則呼叫 ticket 05 的 `harvestGroupDigest_` 送出當天最後一篇
- [x] 完全沒有任何暫存對話的群組,當天不會被 `dailyLineDigestCheck` 觸發任何發文
- [x] 新增一次性的 trigger 安裝函式,建立每日 00:05(Asia/Taipei)的 installable time-driven trigger,handler 指向 `dailyLineDigestCheck`
- [x] 安裝前先用 `ScriptApp.getProjectTriggers()` 檢查是否已存在同一個 handler function 的 time-driven trigger,存在就跳過不重複建立,避免管理者不小心重複執行安裝函式導致同一天被收割兩次
