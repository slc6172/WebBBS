/**
 * Ticket 14 — admin manual password reset.
 *
 * 資安複審（本輪）：原本這裡的說明是「沒被 Code.js 接線，所以打不到」，
 * 這個假設是錯的——google.script.run 能不能呼叫到一個函式，取決於函式
 * 名稱結尾有沒有底線，跟它有沒有被 Code.js/Index.html 接線完全無關。
 * 這支函式本身因為第一、二個參數是 spreadsheet/digestFn 這類瀏覽器端
 * 無法序列化傳遞的 GAS 物件/函式，目前確實無法被外部直接呼叫成功，但
 * 這是參數形狀剛好擋住、不是設計上的防線，所以名稱結尾一併加上底線做
 * 縱深防禦，不要繼續只靠一個容易被之後的重構意外破壞的隱性保護。
 *
 * 核心的雜湊/驗證/寫入邏輯保留在這裡（而不是搬進 tools/ 的一次性工具檔），
 * 是刻意的：一來讓既有的單元測試（見 test/resetPassword_.test.js）
 * 繼續覆蓋這段邏輯，二來如果之後要做站內的管理員密碼重設功能，只需要在
 * Code.js 加一支做好 token/角色檢查的薄包裝函式呼叫這裡，不需要重新推導
 * 雜湊邏輯。真正「讀 placeholder 常數、決定要重設誰」的人工呼叫入口，
 * 移到 tools/adminMaintenanceTools.gs.js，平常不安裝進正式專案。
 */
var _registerModule = (typeof require !== 'undefined') ? require('./register') : null;
var _auditLogModule = (typeof require !== 'undefined') ? require('./auditLog') : null;
var _loginModule = (typeof require !== 'undefined') ? require('./login') : null;

function credentialRevocationPrefixFor_() {
  return _loginModule ? _loginModule.CREDENTIAL_REVOCATION_PREFIX : CREDENTIAL_REVOCATION_PREFIX;
}

function sessionTtlSecondsFor_() {
  return _loginModule ? _loginModule.SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
}

function validatePasswordFor_(password) {
  return (_registerModule ? _registerModule.validatePassword : validatePassword)(password);
}

function hashPasswordFor_(password, salt, digestFn) {
  return (_registerModule ? _registerModule.hashPassword : hashPassword)(password, salt, digestFn);
}

function appendAuditLogEntryFor_(spreadsheet, nowTimestamp, actor, action, target, detail) {
  return (_auditLogModule ? _auditLogModule.appendAuditLogEntry_ : appendAuditLogEntry_)(spreadsheet, nowTimestamp, actor, action, target, detail);
}

function auditActionsFor_() {
  return _auditLogModule ? _auditLogModule.AUDIT_ACTIONS : AUDIT_ACTIONS;
}

/**
 * Finds which row (1-indexed) holds the given userId in a Users-shaped
 * sheet, skipping the header row.
 */
function findUserRowNumber_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === userId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Overwrites a user's passwordHash/salt with a freshly hashed new
 * password.
 * @param {Spreadsheet} spreadsheet
 * @param {Cache} cache - mycr 第 15 輪票 11：用來寫入跨端點共用的撤銷
 *   標記（CREDENTIAL_REVOCATION_PREFIX + userId），供讀取類端點使用，
 *   見函式內部呼叫處的完整說明。
 * @param {function(string): number[]} digestFn
 * @param {string} userId
 * @param {string} newPassword
 * @param {string} newSalt - caller-supplied (e.g. Utilities.getUuid()
 *   when run for real), same pattern as registerUser_ taking salt as input.
 * @param {string} actorUserId - A09：誰執行了這次重設，寫進 AuditLog。
 *   跟 nowTimestamp 一樣由呼叫端提供，這支函式本身不猜測「現在是誰在
 *   操作」——tools/adminMaintenanceTools.gs.js 那個人工呼叫入口用一個
 *   跟 TARGET_USER_ID 同樣風格的 ACTOR_USER_ID 常數讓操作者自己填。
 * @param {string} nowTimestamp - 呼叫端（GAS 環境用 Utilities.formatDate
 *   產生）傳進來，這支函式本身不碰真實時鐘，維持好測試。
 * @param {string} newCredentialVersion - `/mycr` 深層複掃 Finding 1：
 *   caller-supplied（e.g. Utilities.getUuid() when run for real），同樣的
 *   「GAS-only randomness 由呼叫端產生、這支函式本身不碰」慣例，跟
 *   newSalt 是同一個模式。換成一個新值，讓所有在這之前核發、還沒過期的
 *   session（getSessionRole_ 比對用）立刻失效，不用等 6 小時 TTL。刻意用
 *   UUID 而不是「讀現在的值再加 1」——不需要多一次讀取，也不用擔心併發時
 *   的競態，只要保證跟前一個值不一樣即可，opaque 比對不需要遞增語意。
 * @returns {{success: boolean, error?: string}}
 */
function resetPassword_(spreadsheet, cache, digestFn, userId, newPassword, newSalt, actorUserId, nowTimestamp, newCredentialVersion) {
  var sheet = spreadsheet.getSheetByName('Users');
  var row = findUserRowNumber_(sheet, userId);
  if (row === null) {
    return { success: false, error: '使用者不存在' };
  }

  var passwordCheck = validatePasswordFor_(newPassword);
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error };
  }

  var newHash = hashPasswordFor_(newPassword, newSalt, digestFn);
  sheet.getRange(row, 2, 1, 1).setValues([[newHash]]); // B=passwordHash
  sheet.getRange(row, 3, 1, 1).setValues([[newSalt]]); // C=salt
  sheet.getRange(row, 12, 1, 1).setValues([[newCredentialVersion]]); // L=credentialVersion（Finding 1：讓既有 session 立刻失效）

  // mycr 第 15 輪票 11（見 F-02）：跟上面寫進第 12 欄是同一個目的的另一半
  // ——第 12 欄只有 getSessionRole_（即時重讀 Users 表的寫入路徑）看得
  // 到，這裡另外寫一把純快取的撤銷標記，讓讀取類端點（getBoardsFromToken/
  // getBoardBulkFromToken/getArticleDetailFromToken）也能偵測到這次重設，
  // 而不需要它們自己也去重讀 Users 表（那樣就違背了這幾個端點原本要優化
  // 掉試算表呼叫的目的）。TTL 用跟 session token 一樣的 SESSION_TTL_
  // SECONDS，見 CREDENTIAL_REVOCATION_PREFIX 常數旁的完整說明。
  cache.put(credentialRevocationPrefixFor_() + userId, newCredentialVersion, sessionTtlSecondsFor_());

  // A09：只在密碼真的被改成功時才記一筆——使用者不存在、新密碼不合規則
  // 這兩種「什麼都沒改到」的情況不算數，不值得佔用稀少事件的預算。
  appendAuditLogEntryFor_(spreadsheet, nowTimestamp, actorUserId, auditActionsFor_().ADMIN_RESET_PASSWORD, userId, '');

  return { success: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resetPassword_: resetPassword_ };
}