/**
 * 安全性審查 M3：檢查 webhook payload 的 destination 欄位是否對到這個
 * bot 自己的 User ID（PropertiesService 存的 LINE_BOT_USER_ID，格式
 * U[0-9a-f]{32}——不是 LINE Developers Console「Basic settings」頁面
 * 顯示的那個 10 碼數字 Channel ID，兩者是不同的識別碼，見審查報告 M3
 * 的說明）。
 *
 * 這不是真正的簽章驗證：GAS 的 doPost(e) 事件物件不支援讀取 HTTP
 * 標頭（Google 官方已明確表態不會支援此功能），沒辦法驗證
 * X-Line-Signature，拿不到「這個請求真的來自 LINE 平台」的密碼學保證。
 * 這裡做的只是「這個請求聲稱要給我們的 bot」這件事本身有沒有對——一個
 * 不知道這個值的人隨便打這支公開端點會被擋在這裡；一旦這個值洩漏，
 * 這道檢查就完全失效，防護等級跟真正的簽章驗證不是同一回事，屬於
 * 縱深防禦的其中一層，不是唯一防線。
 *
 * bot 自己的 User ID 是 bot 層級的識別碼，不因群組而異——同一個 bot，
 * 不管訊息來自哪個群組，destination 都是同一個值。真正判斷「這是哪個
 * 群組」的是 event.source.groupId（LineGroupBoards 既有的白名單機制），
 * 這裡的檢查是加在那之前、範圍更廣的另一層，兩者互不取代。
 *
 * @param {{destination?: string}} body - JSON.parse(e.postData.contents) 的結果
 * @param {string} [expectedBotUserId] - PropertiesService 存的 LINE_BOT_USER_ID
 * @returns {boolean}
 */
function isWebhookForThisBot(body, expectedBotUserId) {
  if (!expectedBotUserId) {
    // 這個 Script Property 還沒設定（例如這次安全性修復部署前的舊環境，
    // 或忘記設定）。寧可維持「不檢查」的舊行為，讓 LINE 功能繼續正常
    // 運作，也不要因為忘記設定就讓整個功能悄悄失效——這是一道額外的
    // 縱深防禦層，不是核心功能要依賴的必要條件。
    return true;
  }
  return !!body && body.destination === expectedBotUserId;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isWebhookForThisBot: isWebhookForThisBot
  };
}
