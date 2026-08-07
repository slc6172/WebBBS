/**
 * Ticket 03 — login & session token.
 *
 * Needs hashPassword from register.js. In the deployed GAS project,
 * register.js and login.js share one global namespace, so `hashPassword`
 * is simply available as a global there. Under Node we pull it in via
 * require, but we deliberately avoid `var hashPassword = require(...)`
 * because that declaration would still be hoisted in the GAS runtime
 * too (var hoists regardless of whether the branch runs) and would
 * shadow the real global function with `undefined`. Routing every call
 * through hashPasswordFor_ sidesteps that: the ternary only evaluates
 * the branch it needs, so no local `hashPassword` binding is ever
 * created.
 */
var _register = (typeof require !== 'undefined') ? require('./register') : null;

function hashPasswordFor_(password, salt, digestFn) {
  return (_register ? _register.hashPassword : hashPassword)(password, salt, digestFn);
}

/**
 * @returns {boolean}
 */
function verifyPassword(storedHash, salt, candidatePassword, digestFn) {
  var candidateHash = hashPasswordFor_(candidatePassword, salt, digestFn);
  return candidateHash === storedHash;
}

var LOGIN_FAIL_PREFIX = 'loginFail_';
var SESSION_PREFIX = 'session_';
var LOGIN_FAIL_THRESHOLD = 5;
var LOGIN_FAIL_TTL_SECONDS = 900; // 15 minutes
var SESSION_TTL_SECONDS = 21600; // 6 hours — also CacheService's own max TTL

/**
 * Reads a Users-shaped sheet row into a plain record, or null if no
 * matching userId is found. Skips the header row.
 */
function getUserRecord_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return {
        userId: rows[i][0],
        passwordHash: rows[i][1],
        salt: rows[i][2],
        role: rows[i][3],
        createdAt: rows[i][4]
      };
    }
  }
  return null;
}

/**
 * @param {Spreadsheet} spreadsheet
 * @param {Cache} cache - e.g. CacheService.getScriptCache()
 * @param {function(): string} tokenGenerator - e.g. Utilities.getUuid
 * @param {function(string): number[]} digestFn
 * @param {{userId: string, password: string}} input
 * @returns {{success: boolean, token?: string, error?: string}}
 */
function login(spreadsheet, cache, tokenGenerator, digestFn, input) {
  var failKey = LOGIN_FAIL_PREFIX + input.userId;
  var currentFailCount = parseInt(cache.get(failKey) || '0', 10);

  if (currentFailCount >= LOGIN_FAIL_THRESHOLD) {
    return { success: false, error: '帳號已被暫時鎖定,請稍後再試' };
  }

  var sheet = spreadsheet.getSheetByName('Users');
  var record = getUserRecord_(sheet, input.userId);
  var passwordOk = record && verifyPassword(record.passwordHash, record.salt, input.password, digestFn);

  if (!passwordOk) {
    cache.put(failKey, String(currentFailCount + 1), LOGIN_FAIL_TTL_SECONDS);
    return { success: false, error: 'userId 或密碼錯誤' };
  }

  var token = tokenGenerator();
  cache.remove(failKey);
  cache.put(SESSION_PREFIX + token, input.userId, SESSION_TTL_SECONDS);
  return { success: true, token: token };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyPassword: verifyPassword,
    login: login,
    getUserRecord_: getUserRecord_,
    SESSION_PREFIX: SESSION_PREFIX
  };
}