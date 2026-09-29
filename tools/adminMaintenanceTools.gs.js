/**
 * ============================================================
 * 一次性/偶爾才需要的管理員維運工具集合
 * ============================================================
 *
 * 資安複審發現：這裡的每一支函式原本都散落在 src/AdminTools.js、
 * src/test.js 裡，永久待在正式部署的專案中。問題是 Google Apps Script
 * 的 google.script.run 能不能被任何載入過網頁的訪客直接呼叫，取決於
 * 函式名稱結尾有沒有底線，跟這些函式有沒有被 Code.js/Index.html 接線
 * 呼叫完全無關——「沒被前端呼叫」不等於「打不到」。這幾支函式又都只在
 * 特殊情境（設定出錯時診斷、手動重設密碼、第一次安裝排程）才需要用到，
 * 沒有理由讓它們整年待在已部署的專案裡增加暴露面。
 *
 * 使用方式：
 *   1. 只有真的需要底下某一項操作時，才把這整個檔案貼進 Apps Script 編輯器
 *      （src/ 底下的檔案本來就已經在專案裡，不用重複貼）
 *   2. 在編輯器上方的函式下拉選單選擇你需要的函式，按執行
 *   3. 查看執行紀錄（View > Logs / 左側「執行項目」）確認結果
 *   4. 用完立刻把這個檔案從 Apps Script 專案裡刪除，不要讓它常駐在正式
 *      部署裡——這是這批工具唯一的防線，删除比留著更安全
 */

/**
 * 診斷用：驗證 UrlFetchApp 權限（`script.external_request`）是否正常
 * 授權。打的是 LINE 官方一個唯讀端點，故意帶假 token，預期收到 401——
 * 重點不是這支 API 通不通，而是 GAS 讓不讓打這支 API。就算 Script
 * Properties 裡還沒填真正的 LINE_CHANNEL_ACCESS_TOKEN 也能跑。
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
 * webhook payload 的 destination 欄位，見 src/verifyWebhookDestination.js）
 * 一旦設定不對，M3 檢查會把「所有」正常的 LINE webhook 請求都擋下來，
 * 訊息完全進不了 LineStaging，而且只能靠 doPost 裡的 console.log 事後從
 * 執行紀錄查——要等一則真的訊息進來才看得到。這支工具不用等待任何外部
 * 事件，直接呼叫 LINE 官方的 `GET /v2/bot/info`，回應裡的 userId 欄位
 * 就是這個 bot 真正的 User ID，權威、即時。
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
 * 驗證與授權 ScriptApp 權限（`script.scriptapp`，建立 trigger 需要的
 * 權限）。執行這支函式會建立一個一年後才觸發的測試用 trigger，藉此強迫
 * GAS 跳出授權畫面。
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
 * 手動重設一個使用者的密碼。核心的雜湊/驗證/寫入邏輯在
 * src/adminResetPassword.js 的 resetPassword_（已有單元測試覆蓋，這裡
 * 只是薄薄一層呼叫），這支函式只負責讀下面三個常數、決定要重設誰、
 * 由誰執行。
 *
 * 步驟：
 * 1. 編輯下面的 TARGET_USER_ID、NEW_PASSWORD、ACTOR_USER_ID（填自己的
 *    userId——A09 稽核紀錄會記下是誰執行了這次重設，不要留 placeholder
 *    或隨便填別人的帳號）。
 * 2. 函式下拉選單選 resetUserPasswordManually，按執行。
 * 3. 查看執行紀錄（View > Logs）確認結果。
 * 4. 不管成功與否，把下面三個常數改回 placeholder，不要讓真實密碼留在
 *    原始碼裡——執行完就代表這個檔案的任務結束，直接從專案裡刪除即可，
 *    不需要特地把常數改回去再留著。
 */
function resetUserPasswordManually() {
  var TARGET_USER_ID = 'PUT_USER_ID_HERE';
  var NEW_PASSWORD = 'PUT_NEW_PASSWORD_HERE';
  var ACTOR_USER_ID = 'PUT_YOUR_OWN_USER_ID_HERE';

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache(); // mycr 第 15 輪票 11：resetPassword_ 現在需要 cache 寫入跨端點共用的撤銷標記
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };
  var newSalt = Utilities.getUuid();
  var newCredentialVersion = Utilities.getUuid(); // `/mycr` 深層複掃 Finding 1：讓這次重設同時撤銷既有 session
  var nowTimestamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  var result = resetPassword_(spreadsheet, cache, digestFn, TARGET_USER_ID, NEW_PASSWORD, newSalt, ACTOR_USER_ID, nowTimestamp, newCredentialVersion);
  Logger.log(JSON.stringify(result));
}

/**
 * 一次性的安裝函式：建立每日 00:05（Asia/Taipei）的 installable
 * time-driven trigger，handler 指向 src/lineBotGlue.js 的
 * dailyLineDigestCheck_。安裝前先檢查是否已存在同一個 handler function
 * 的 time-driven trigger，存在就跳過不重複建立，避免不小心重複執行導致
 * 同一天被收割兩次。
 *
 * dailyLineDigestCheck_ 名稱結尾的底線，代表它不會出現在 Apps Script
 * 「新增觸發條件」面板的函式選擇下拉選單裡（這是實測確認過的行為）。
 * 這正是這支安裝函式改成「用程式碼指定 handler 名稱字串」而不是「請你
 * 自己去觸發條件頁面手動選」的原因——已實測確認，即使目標函式在面板選
 * 不到，用 ScriptApp.newTrigger() 這種程式化方式一樣能成功建立，日後
 * 也會正常觸發、正常執行。
 *
 * 只需要成功執行一次；不需要重複呼叫，也不需要保留在正式部署的專案裡。
 * 既有部署要升級這一輪的程式碼時，記得先手動到「觸發條件」頁面刪掉舊的
 * 指向 dailyLineDigestCheck（沒有底線的舊名稱）的 trigger，部署新程式碼
 * 後再執行這支函式一次。
 */
function installDailyLineDigestTrigger() {
  var alreadyInstalled = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'dailyLineDigestCheck_';
  });
  if (alreadyInstalled) {
    Logger.log('已經存在指向 dailyLineDigestCheck_ 的 trigger，不重複建立。');
    return;
  }

  ScriptApp.newTrigger('dailyLineDigestCheck_')
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();
  Logger.log('[OK] 已建立每日 00:05（Asia/Taipei）的 dailyLineDigestCheck_ trigger。');
}

/**
 * mycr 第 15 輪票 14（見 F-07）：手動強制重跑一次完整的 ensureSchema，
 * 並把 Script Properties 裡記錄的「已套用版本」更新成程式碼裡目前的
 * SCHEMA_VERSION——不透過 doGet 的版本閘門，不管閘門判斷結果是什麼都
 * 強制執行。
 *
 * 使用時機：
 *   1. 部署一個有調高 SCHEMA_VERSION 的版本之後，建議先手動跑這支
 *      一次，確認 schema 異動確實生效，不要單純依賴閘門在正式流量下
 *      被第一位訪客的請求自動觸發——那個時機無法控制，也可能是在
 *      管理員還沒來得及檢查的情況下就發生。
 *   2. 懷疑 Script Properties 裡記錄的版本號跟實際表格結構對不上
 *      （例如手動改過 Script Properties、或表格被人手動改壞）時，
 *      用這支強制修復並校正版本號。
 *
 * 只需要成功執行一次；不需要保留在正式部署的專案裡。
 */
function forceEnsureSchema() {
  var props = PropertiesService.getScriptProperties();
  ensureSchema(SpreadsheetApp.getActiveSpreadsheet(), buildRoleValidationRule_); // buildRoleValidationRule_ 定義在 Code.js，這個工具貼進專案時已經存在
  props.setProperty('appliedSchemaVersion', String(SCHEMA_VERSION));
  Logger.log('[OK] 已強制重跑完整的 ensureSchema，並把已套用版本更新為 ' + SCHEMA_VERSION + '。');
}
