# 04 — 訊息收回(unsend)處理

**What to build:** 發話人收回一則仍在暫存階段的訊息時,對應暫存紀錄補上「已收回」標記並保留原始內容;已經彙整張貼出去的文章不會因此被回頭修改。

**Blocked by:** 02

**Status:** done

- [x] `doPost` 能辨識 LINE 的 unsend 事件(`event.type === 'unsend'`),取出被收回訊息對應的 `webhookEventId`(即原始訊息的 `messageId`)
- [x] 新增純函式 `markRecalled(rows, webhookEventId)`:輸入現有暫存列與 `webhookEventId`,回傳把對應列標記為已收回(`recalled` 設為 true,原始 `content` 保留不刪除)後的新陣列;找不到對應列時原樣回傳,不做任何修改
- [x] 收到 unsend 事件時,找到暫存階段對應的列、套用 `markRecalled` 的結果寫回 `LineStaging`;找不到對應列(訊息已被彙整張貼、暫存列已刪除)時不做任何修改、不報錯、不對外顯示任何錯誤
- [x] 已經彙整張貼出去的文章,不會因為原始訊息事後被收回而回頭被修改(驗證方式:先讓訊息被收割送出、暫存列刪除,再對同一則訊息送出 unsend 事件,確認已張貼文章內容不變、也不會產生新的暫存列)
- [x] 寫入 `LineStaging` 的路徑用 `LockService.getScriptLock()` 保護
