# 02 — 文字與固定類型訊息接收、白名單過濾、去重

**What to build:** 新增 `doPost(e)` 進入點,接收 LINE Messaging API 的 webhook 事件。授權群組傳來的文字訊息、以及貼圖/影片/語音/檔案/位置等會被記錄為固定文字註記,系統事件(成員加入/退出)不記錄,未授權群組完全不記錄不回應,重送的同一則事件不會建立重複紀錄。這是第一個端到端可展示的切片——送一則訊息進去、去 `LineStaging` 分頁看得到結果。

**Blocked by:** 01

**Status:** done

- [x] 新增 `doPost(e)` 進入點,建議獨立放在新檔案(例如 `lineBotGlue.js`),不要塞進既有的 `Code.js`(`Code.js` 專職 `doGet` 相關膠水,`lineBotGlue.js` 專職 `doPost` 相關膠水,兩者是不同的進入點)
- [x] `doPost` 能解析 LINE webhook 的 JSON payload、依 `events[].type` 分派處理;非 `message`/`unsend` 類型的事件(例如成員加入/退出群組)直接略過,不建立任何暫存紀錄、不呼叫任何 LINE API
- [x] 新增純函式 `resolveGroupBoard(rows, groupId)`:輸入 `LineGroupBoards` 的列陣列與 `groupId`,回傳該群組是否為授權群組、以及對應的 `boardId`/`groupName`;找不到就回傳未授權
- [x] 收到訊息事件時,先用 `resolveGroupBoard` 檢查來源群組是否在白名單內;未授權群組的訊息不寫入 `LineStaging`、不對該群組發出任何回應,也不會讓 bot 自動退出該群組
- [x] 新增純函式 `classifyLineMessage(event)`:依 `message.type` 分類——`text` 完整記錄文字內容;`sticker`/`video`/`audio`/`file`/`location` 轉成對應的固定文字註記(例如「此處有一則貼圖」「此處有一段影片」),不保存原始內容;無法辨識的型態安全歸類為忽略、不報錯;`image` 型態這張先只回傳型態與訊息 ID,實際下載留給 ticket 03 處理
- [x] 授權群組傳來的文字/固定註記類型訊息,記錄一列到 `LineStaging`(含發話人顯示名稱、傳送時間、內容、`webhookEventId`);發話人顯示名稱透過 LINE 的「取得群組成員檔案」API 以 `event.source.userId` 換取
- [x] 固定文字註記類型(貼圖等)不計入判斷分段門檻用的圖片數量
- [x] 新增純函式 `hasProcessedEvent(rows, webhookEventId)`:輸入現有暫存列與 `webhookEventId`,判斷是否已有對應紀錄;webhook 重送同一則仍在暫存階段的訊息事件時,不建立第二筆重複紀錄(若對應暫存列已因彙整張貼被清除,重送是否仍建立新紀錄不做保證,這是已知且接受的邊界情況)
- [x] 寫入 `LineStaging` 的路徑用 `LockService.getScriptLock()` 保護,避免短時間內多個請求同時寫入互相覆蓋
