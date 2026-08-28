# 03 — 圖片訊息接收與既有 Drive 儲存整合

**What to build:** 授權群組傳來的圖片訊息,以原始畫質下載後透過既有的 Drive 圖片儲存機制保存,並在暫存紀錄裡留下可存取連結,正確計入分段門檻的圖片數量。

**Blocked by:** 02

**Status:** done

- [x] `doPost` 收到授權群組的 `image` 類型訊息時,呼叫 LINE 的訊息內容 API(`UrlFetchApp.fetch`)下載原始畫質圖片內容
- [x] 下載到的圖片內容轉成 base64,透過既有 `imageStorage.js` 的 `saveArticleImage(drive, properties, base64Data, mimeType, fileName, yyyyMM)` 存進 Drive,沿用既有的根資料夾/月份子資料夾結構與「知道連結者可檢視」分享權限;`imageStorage.js` 本身不需要任何修改
- [x] 存好的圖片連結記錄進 `LineStaging` 對應列(顯示名稱、時間比照文字訊息;內容欄位存圖片連結;`messageType` 標示為圖片),仍然用 `hasProcessedEvent` 做去重、用同一把鎖保護寫入路徑
- [x] 圖片訊息計入分段門檻計算所需的圖片數量;貼圖等固定文字註記類型不計入(ticket 02 已確認的行為,這張再次驗證不會因為圖片邏輯加入而回歸)
- [x] 圖片下載或上傳失敗時,記錄錯誤但不讓整個 webhook 請求整批失敗,避免拖累同一批次裡其他訊息的處理
