/**
 * 手動執行專用的維運/除錯工具集，不是任何功能的一部分，也不會被
 * doPost/doGet 呼叫到，跟 test/ 底下的 Vitest 自動化測試無關（檔名雖然
 * 是 test.js，但這是要貼進 Apps Script 專案、在編輯器裡手動執行的檔案，
 * 不是 Node 測試檔）。
 */

/**
 * 步驟一：驗證 UrlFetchApp 權限（`script.external_request`）。
 * 打的是 LINE 官方一個唯讀端點，故意帶假 token，預期收到 401——重點不是
 * 這支 API 通不通，而是 GAS 讓不讓打這支 API。就算 Script Properties 裡
 * 還沒填真正的 LINE_CHANNEL_ACCESS_TOKEN 也能跑。
 */
function checkUrlFetchPermission() {
  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: 'Bearer dummy-token' },
    muteHttpExceptions: true
  });
  Logger.log('[OK] UrlFetchApp 權限正常！HTTP 狀態碼：' + response.getResponseCode() + '（401 是預期中的正常結果，代表權限沒問題、只是 token 是假的）');
}

/**
 * 診斷用：查出 LINE bot 真正的 User ID。
 *
 * 背景：Script Properties 的 LINE_BOT_USER_ID（安全性審查 M3 用來比對
 * webhook payload 的 destination 欄位，見 verifyWebhookDestination.js）
 * 一旦設定不對，M3 檢查會把「所有」正常的 LINE webhook 請求都擋下來，
 * 訊息完全進不了 LineStaging，而且目前只能靠 doPost 裡的 console.log
 * 事後從執行紀錄查——要等一則真的訊息進來才看得到。這支工具不用等待
 * 任何外部事件，直接呼叫 LINE 官方的 `GET /v2/bot/info`，回應裡的
 * userId 欄位就是這個 bot 真正的 User ID，權威、即時。
 *
 * 容易搞混的地方：LINE Developers Console「Basic settings」頁面顯示的
 * 「Your user ID」，是你自己（登入 Console 的開發者帳號）的個人 LINE
 * User ID，跟 bot 自己的 User ID 是兩個完全不同的值，只是格式長得一樣
 * （都是 U 開頭 + 32 碼十六進位字元），很容易誤把前者當成後者填進
 * LINE_BOT_USER_ID。這支工具直接問 LINE 官方 API 要 bot 自己的值，不
 * 透過任何容易混淆的 Console 畫面。
 *
 * 用法：函式下拉選單選 checkLineBotUserId 執行，查看 Logger 印出的
 * userId，貼到 Script Properties 的 LINE_BOT_USER_ID 取代掉錯誤的值。
 * 只發一個 GET 讀取 bot 自己的公開資訊，不寫入任何試算表或 LINE 設定，
 * 沿用既有的 LINE_CHANNEL_ACCESS_TOKEN，不需要額外憑證。這是可以之後
 * 重複使用的診斷工具（跟上面的 checkUrlFetchPermission 一樣），不是
 * 做完即可刪除的一次性遷移腳本，故意放在這裡而不是 tools/。
 */
function checkLineBotUserId() {
  var channelAccessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!channelAccessToken) {
    Logger.log('Script Properties 還沒設定 LINE_CHANNEL_ACCESS_TOKEN，請先照 README 的 LINE 機器人設定步驟填好這個值，再重新執行這支工具。');
    return;
  }

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: 'Bearer ' + channelAccessToken },
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  var bodyText = response.getContentText();

  if (statusCode !== 200) {
    Logger.log(
      '呼叫 LINE 的 GET /v2/bot/info 失敗，HTTP 狀態碼：' + statusCode + '\n' +
      '回應內容：' + bodyText + '\n' +
      '（常見原因：LINE_CHANNEL_ACCESS_TOKEN 過期或不正確，回 LINE Developers Console 的「Messaging API」頁籤重新核發一次長期 token）'
    );
    return;
  }

  var info = JSON.parse(bodyText);
  Logger.log(
    '查詢成功。\n' +
    'Bot 顯示名稱：' + info.displayName + '\n' +
    'Bot Basic ID（@開頭那個，跟這裡無關，不要跟下面這個搞混）：' + info.basicId + '\n' +
    'Bot 真正的 User ID 是：' + info.userId + '\n' +
    '請把上面這個 User ID 複製貼到 Script Properties 的 LINE_BOT_USER_ID。'
  );
}

/**
 * 步驟二：驗證與授權 ScriptApp 權限（`script.scriptapp`，建立 trigger
 * 需要的權限）。執行這支函式會建立一個一年後才觸發的測試用 trigger，
 * 藉此強迫 GAS 跳出授權畫面。
 *
 * 真實環境測試發現：`ScriptApp.deleteTrigger()` 在協作者帳號（不是專案
 * 擁有者）身上會報錯，所以這裡刻意不自動刪除測試 trigger——執行完之後
 * 麻煩自己到編輯器左側「觸發條件」（鬧鐘圖示）手動刪掉。雖然設定成一年
 * 後才會真的觸發，但終究是留在專案裡的垃圾 trigger，記得清。
 */
function triggerScriptAppPermission() {
  var testTrigger = ScriptApp.newTrigger('forceLineFeatureAuthorization_noop_')
    .timeBased()
    .after(365 * 24 * 60 * 60 * 1000)
    .create();

  Logger.log('[OK] ScriptApp 授權成功！已建立測試 Trigger，ID 為：' + testTrigger.getUniqueId());
  Logger.log('提示：您可以點擊 GAS 編輯器左側的「觸發條件（鬧鐘圖示）」手動把該測試 trigger 刪除。');
}

/**
 * 給 triggerScriptAppPermission 建立測試 trigger 用的假 handler，永遠不會
 * 真的被觸發執行（trigger 設定一年後才觸發，而且應該在那之前就被手動
 * 刪除了），這裡只是讓 ScriptApp.newTrigger 有一個合法的 handler function
 * 名稱可以指。
 */
function forceLineFeatureAuthorization_noop_() {}

/**
 * 手動除錯用：帶一個真實登入的 session token，模擬「這個使用者在這個
 * 看板下會看到哪些文章」，不用真的打開瀏覽器登入、操作 UI 就能檢查
 * getArticlesForRole 的行為。token 要從瀏覽器已登入分頁的開發者工具拿，
 * limit 是回傳筆數上限，避免整個看板資料量大時洗版執行紀錄。
 * @param {string} token
 * @param {string} boardId
 * @param {number} limit
 * @returns {Array}
 */
function debugGetArticlesLimited(token, boardId, limit) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var articles = getArticlesForRole(ss, role, boardId);
  return articles.slice(0, limit);
}

/**
 * 驗證 Drive 權限是否正常授權，隨便呼叫一個 Drive 服務即可。
 */
function testDriveAuth() {
  DriveApp.getRootFolder(); // 隨便呼叫一個 Drive 服務
}

/**
 * 驗證 Drive 資料夾的分享設定 API 是否正常運作（圖片上傳功能會用到同一
 * 套機制）。**會建立一個真的 Drive 資料夾**，執行完在 Logger 印出的網址
 * 裡確認分享設定正確後，記得手動去 Drive 刪除這個測試資料夾，不會自動
 * 清除。
 */
function testDriveSharing() {
  var folder = DriveApp.createFolder('sharing-test-delete-me');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('成功: ' + folder.getUrl());
}
