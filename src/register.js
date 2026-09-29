/**
 * Ticket 02 — user registration.
 * All functions here live in the same file (rather than split further)
 * because in the deployed GAS project they share one global namespace
 * anyway with no real module boundary; grouping the cohesive
 * "registration" behaviors together avoids inventing a Node-only
 * require() wiring that GAS can't use.
 */

var USER_ID_PATTERN = /^[A-Za-z0-9_]+$/;

// mycr 第 15 輪票 02（見 F-04）：LINE 彙整文章固定用字串 'SYSTEM' 當
// 作者（見 lineBotGlue.js 的 harvestGroupDigest_），一般使用者若搶先
// 註冊到這個帳號名稱，就能編輯/刪除全部彙整文章。只保留這一個名字——
// 'admin'/'root' 之類在這個專案裡不是任何有功能意義的 userId（已確認
// 程式碼裡凡是出現 'admin' 字串都是在比對 Users.role 這個獨立欄位，不
// 是 userId），不需要一併保留。
var RESERVED_USER_IDS = ['system'];

// mycr 第 15 輪票 02（見 F-15）：純數字字串寫進 Users 表會被 Google
// Sheets 自動轉成 Number，讀回來的型別跟註冊/登入時用字串比對
// （userId === ...）不一致，會讓唯一性檢查與登入失效。在註冊時直接
// 拒絕，比在儲存層想辦法保護成本低很多（後者要動到每一個讀 userId
// 做比對的呼叫端）。
var PURELY_NUMERIC_PATTERN = /^[0-9]+$/;

// 提高註冊成本（見對話紀錄）：GAS 的 doGet/doPost 事件物件完全沒有來源 IP
// 或任何 HTTP 標頭欄位（已查證官方文件，見 verifyWebhookDestination.js
// 同一類平台限制的說明），沒有辦法用 IP 區分惡意/正常來源；任何全站共用
// 的計數器都逃不掉「一個惡意來源可以耗盡所有人共用的額度」這個結構性
// 限制，所以這裡刻意選了「提高成本」而不是「精準攔截」的定位——兩個
// 上限都刻意設成很低的起始值，之後依實際使用狀況調整，不是想著要一次
// 就調到完美的門檻值。
//
// 兩層固定視窗（fixed window）計數器，寫法比照 login.js 既有的登入失敗
// 鎖定機制：cache.get 讀目前計數、cache.put 用視窗秒數當 TTL——視窗到期
// 後 key 自然消失，等於重置，不需要額外的清除邏輯。故意不用 LockService
// 保護這段讀寫（跟 login.js 的鎖定計數器一樣的取捨）：極端併發下可能會
// 多算一兩次，只會讓門檻稍微鬆一點，不影響「提高成本」這個定位本身。
var REGISTER_LIMIT_PER_5MIN = 1;
var REGISTER_LIMIT_PER_HOUR = 10;
var REGISTER_WINDOW_5MIN_KEY = 'registerCount5Min';
var REGISTER_WINDOW_1HOUR_KEY = 'registerCount1Hour';
var REGISTER_WINDOW_5MIN_SECONDS = 5 * 60;
var REGISTER_WINDOW_1HOUR_SECONDS = 60 * 60;

/**
 * @param {Cache} cache - e.g. CacheService.getScriptCache()
 * @returns {{allowed: boolean}}
 */
function checkAndConsumeRegistrationQuota_(cache) {
  var fiveMinCount = parseInt(cache.get(REGISTER_WINDOW_5MIN_KEY), 10) || 0;
  var hourCount = parseInt(cache.get(REGISTER_WINDOW_1HOUR_KEY), 10) || 0;

  if (fiveMinCount >= REGISTER_LIMIT_PER_5MIN || hourCount >= REGISTER_LIMIT_PER_HOUR) {
    return { allowed: false };
  }

  cache.put(REGISTER_WINDOW_5MIN_KEY, String(fiveMinCount + 1), REGISTER_WINDOW_5MIN_SECONDS);
  cache.put(REGISTER_WINDOW_1HOUR_KEY, String(hourCount + 1), REGISTER_WINDOW_1HOUR_SECONDS);
  return { allowed: true };
}

/**
 * @param {string} userId
 * @returns {{valid: boolean, error?: string}}
 */
function validateUserId(userId) {
  if (typeof userId !== 'string' || userId.length < 4 || userId.length > 20) {
    return { valid: false, error: 'userId 長度需為 4~20 字元' };
  }
  if (!USER_ID_PATTERN.test(userId)) {
    return { valid: false, error: 'userId 只能包含英數字與底線' };
  }
  if (RESERVED_USER_IDS.indexOf(userId.toLowerCase()) !== -1) {
    return { valid: false, error: '此帳號名稱已保留，請改用其他名稱' };
  }
  if (PURELY_NUMERIC_PATTERN.test(userId)) {
    return { valid: false, error: 'userId 不能全部是數字' };
  }
  return { valid: true };
}

// mycr 第 15 輪票 02：常見弱密碼黑名單（見 mycr 掃描報告 F-06 的零成本
// 切片——pepper／多輪雜湊迭代那半維持延後，只做這個純函式層級的政策
// 收斂）。只收最短長度提高到 8 碼之後仍然合格、但字典攻擊第一輪就會
// 命中的密碼；比對前統一轉小寫。這份清單不是密碼政策的完整解，之後
// 依實際情況調整不需要重新走一次設計流程。
var COMMON_WEAK_PASSWORDS = [
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein1', 'admin1234', 'iloveyou1', '11111111',
  'abc123456', 'welcome1', 'monkey123', 'dragon123', 'football1',
  'baseball1', 'trustno1a', 'sunshine1', 'princess1', 'superman1'
];

/**
 * @param {string} password
 * @returns {{valid: boolean, error?: string}}
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, error: '密碼長度至少需要8碼' };
  }
  if (COMMON_WEAK_PASSWORDS.indexOf(password.toLowerCase()) !== -1) {
    return { valid: false, error: '此密碼過於常見，請換一個更安全的密碼' };
  }
  return { valid: true };
}

/**
 * Converts a byte array (as returned by GAS's Utilities.computeDigest,
 * which uses signed bytes) into a lowercase hex string.
 */
function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var unsigned = b < 0 ? b + 256 : b;
    var hex = unsigned.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * @param {string} password
 * @param {string} salt
 * @param {function(string): number[]} digestFn - in production this is
 *   `function (s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s); }`,
 *   injected so this function has no direct dependency on the GAS runtime.
 * @returns {string} hex-encoded hash
 */
function hashPassword(password, salt, digestFn) {
  var bytes = digestFn(password + salt);
  return bytesToHex_(bytes);
}

/**
 * Finds which row (1-indexed, matching Sheets' own numbering) holds the
 * given userId in a Users-shaped sheet, skipping the header row.
 * Returns null if no match.
 */
function findUserRow_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === userId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Registers a new user: validates format, checks uniqueness and writes
 * the row under a lock, hashes the password, and hard-codes role to
 * 'newbie' — there is no parameter through which a caller could set any
 * other role.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock - e.g. LockService.getScriptLock() in production
 * @param {function(string): number[]} digestFn
 * @param {{userId: string, password: string, salt: string, createdAt: string}} input
 * @returns {{success: boolean, error?: string}}
 */
function registerUser_(spreadsheet, lock, digestFn, input) {
  var userIdCheck = validateUserId(input.userId);
  if (!userIdCheck.valid) {
    return { success: false, error: userIdCheck.error };
  }
  var passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error };
  }

  lock.waitLock(10000);
  try {
    var sheet = spreadsheet.getSheetByName('Users');
    if (findUserRow_(sheet, input.userId) !== null) {
      return { success: false, error: 'userId 已被使用' };
    }
    var passwordHash = hashPassword(input.password, input.salt, digestFn);
    sheet.appendRow([input.userId, passwordHash, input.salt, 'newbie', "'" + input.createdAt]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateUserId: validateUserId,
    validatePassword: validatePassword,
    hashPassword: hashPassword,
    registerUser_: registerUser_,
    checkAndConsumeRegistrationQuota_: checkAndConsumeRegistrationQuota_,
    REGISTER_LIMIT_PER_5MIN: REGISTER_LIMIT_PER_5MIN,
    REGISTER_LIMIT_PER_HOUR: REGISTER_LIMIT_PER_HOUR
  };
}