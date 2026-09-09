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
var _schemaModule = (typeof require !== 'undefined') ? require('./schema') : null;

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
var SESSION_SNAPSHOT_PREFIX = 'sessionPerm_';
var LOGIN_FAIL_THRESHOLD = 5;
var LOGIN_FAIL_TTL_SECONDS = 900; // 15 minutes
var SESSION_TTL_SECONDS = 21600; // 6 hours — also CacheService's own max TTL

/**
 * Reads a Users-shaped sheet row into a plain record, or null if no
 * matching userId is found. Skips the header row.
 *
 * 優化輪 ticket 07：也讀出 loginCount/lastLoginAt（新使用者/尚未跑過這次優化
 * 遷移的舊資料列，這兩欄是空字串，正規化成 0 / ''）以及 row_（1-indexed 的
 * 實際列號），login() 需要這個列號才能把新的登入統計寫回同一列。
 * 看板新內容提示功能：也讀出 lastSeenBoards（第 10 欄，JSON 字串原樣讀出，
 * 空字串代表「從沒進去過任何看板」，解析成物件是 boardActivity.js 的工作，
 * 不是這裡）。
 * @提及輪 ticket 05：也讀出 pendingMentions（第 11 欄，JSON 字串原樣讀出，
 * 空字串代表「目前沒有任何待通知的提及」，解析是 mentions.js 的工作）。
 */
function getUserRecord_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return {
        userId: rows[i][0],
        passwordHash: rows[i][1],
        salt: rows[i][2],
        role: rows[i][3],
        createdAt: rows[i][4],
        loginCount: rows[i][5] || 0,
        lastLoginAt: rows[i][6] || '',
        lastSeenBoards: rows[i][9] || '',
        pendingMentions: rows[i][10] || '',
        row_: i + 2
      };
    }
  }
  return null;
}

/**
 * Whether a role is currently allowed to log in, per the Permission
 * sheet's `login` column. Deliberately NOT routed through permissions.js's
 * getRolePermissions — permissions.js already requires login.js (for
 * getSessionRole's reuse of getUserRecord_), and requiring permissions.js
 * back from here would create a circular require. Node resolves that
 * inconsistently depending on which of the two files a test happens to
 * require first, handing the *other* file a half-populated module.exports
 * — a landmine that wouldn't surface at require-time, only whenever the
 * stale reference actually gets called. Rather than touch that existing,
 * working dependency direction, this is a small local lookup instead —
 * same tradeoff this codebase already makes elsewhere (e.g.
 * findArticleBoardId_ duplicated across postReply.js/deleteReply.js
 * rather than shared) in favor of avoiding cross-file coupling.
 * Fails safe: unknown/removed role returns false, same as
 * getRolePermissions would.
 */
function roleAllowsLogin_(spreadsheet, role) {
  var sheet = spreadsheet.getSheetByName('Permission');
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return false;
  }
  var headers = (_schemaModule ? _schemaModule.SHEET_HEADERS : SHEET_HEADERS).Permission;
  var loginCol = headers.indexOf('login'); // 0-indexed, matches getValues() row shape
  var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === role) {
      return !!rows[i][loginCol];
    }
  }
  return false;
}

/**
 * @param {Spreadsheet} spreadsheet
 * @param {Cache} cache - e.g. CacheService.getScriptCache()
 * @param {function(): string} tokenGenerator - e.g. Utilities.getUuid
 * @param {function(string): number[]} digestFn
 * @param {string} nowTimestamp - 由呼叫端（GAS 環境）用 Utilities.formatDate 產生好傳進來，
 *   保持這支函式本身不碰真實時鐘、好測試（比照 register.js 的 createdAt 慣例）
 * @param {{userId: string, password: string}} input
 * @returns {{success: boolean, token?: string, loginCount?: number, lastLoginAt?: string, error?: string}}
 *   loginCount 是「這次登入算進去之後」的總數（第一次登入回傳 1）；
 *   lastLoginAt 是「這次登入之前」最後一次登入的時間（第一次登入回傳空字串，
 *   代表尚無記錄——這兩個刻意錯開一格，前端才顯示得出「上一次」是什麼時候）。
 */
function login(spreadsheet, cache, tokenGenerator, digestFn, nowTimestamp, input) {
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

  // 權限系統 ticket 09：密碼驗證通過後才檢查登入權限，訊息刻意跟密碼錯誤
  // 完全相同、也不佔用鎖定計數——這是角色被擋，不是猜密碼，兩者是不同的
  // 拒絕原因，不該共用同一個計數器（否則被停權的帳號被外部一直嘗試，反而
  // 可能先把自己鎖起來）。
  if (!roleAllowsLogin_(spreadsheet, record.role)) {
    return { success: false, error: 'userId 或密碼錯誤' };
  }

  var previousLoginCount = record.loginCount || 0;
  var previousLastLoginAt = record.lastLoginAt || '';
  var newLoginCount = previousLoginCount + 1;

  // 寫回新的登入次數/登入時間。刻意不上鎖：純顯示用統計，不影響權限判斷，
  // 極端併發下少算一次也只是小小的顯示誤差（見 spec 的取捨說明）。
  sheet.getRange(record.row_, 6, 1, 2).setValues([[newLoginCount, "'" + nowTimestamp]]);

  // @提及輪 ticket 06：登入成功時把 pendingMentions 清空——不管使用者接下來
  // 有沒有真的點開來看，這份清單只顯示這一次。維持跟上面登入統計那次寫入
  // 完全分開、範圍只到第 11 欄的獨立 setValues，不合併成一次大範圍寫入去
  // 動到 lastSeenBoards/articleCount/replyCount 這些沒有真的變動的欄位。
  //
  // 這裡故意不 require mentions.js 來重用它的 getPendingMentions_——
  // mentions.js 已經 require 這個檔案（拿 getUserRecord_），反過來再
  // require 回去會形成循環 require，跟這個檔案上面 roleAllowsLogin_ 的
  // 註解、以及 ticket 05 處理 escapeFormulaInjection 時踩到的是同一個
  // 陷阱。这裡直接放一份小小的本地解析（try/parse，失敗當空陣列），不去
  // 動現有的 require 方向。
  var pendingMentions = [];
  try {
    var parsed = JSON.parse(record.pendingMentions || '[]');
    pendingMentions = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    pendingMentions = [];
  }
  sheet.getRange(record.row_, 11, 1, 1).setValues([['[]']]);

  var token = tokenGenerator();
  cache.remove(failKey);
  cache.put(SESSION_PREFIX + token, input.userId, SESSION_TTL_SECONDS);
  return {
    success: true,
    token: token,
    loginCount: newLoginCount,
    lastLoginAt: previousLastLoginAt,
    pendingMentions: pendingMentions
  };
}

/**
 * Stores a read-path permission snapshot (built by boards.js's
 * buildRoleSnapshot) under its own keyspace, separate from
 * SESSION_PREFIX's userId value — so every existing write-path caller
 * that reads SESSION_PREFIX + token expecting a bare userId string
 * keeps working completely unchanged (perf-optimization ticket 03).
 * Same TTL as the session token itself.
 * @param {Cache} cache
 * @param {string} token
 * @param {{permissions: Object, allowedBoardIds: string[]}} snapshot
 */
function putSessionSnapshot(cache, token, snapshot) {
  cache.put(SESSION_SNAPSHOT_PREFIX + token, JSON.stringify(snapshot), SESSION_TTL_SECONDS);
}

/**
 * @param {Cache} cache
 * @param {string} token
 * @returns {{permissions: Object, allowedBoardIds: string[]}|null} null
 *   when nothing was stored, the entry expired, or the stored value
 *   isn't valid JSON (fails safe — callers treat null exactly like "not
 *   logged in").
 */
function getSessionSnapshot(cache, token) {
  var raw = cache.get(SESSION_SNAPSHOT_PREFIX + token);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * @param {Cache} cache
 * @param {string} token
 */
function removeSessionSnapshot(cache, token) {
  cache.remove(SESSION_SNAPSHOT_PREFIX + token);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyPassword: verifyPassword,
    login: login,
    getUserRecord_: getUserRecord_,
    SESSION_PREFIX: SESSION_PREFIX,
    SESSION_SNAPSHOT_PREFIX: SESSION_SNAPSHOT_PREFIX,
    SESSION_TTL_SECONDS: SESSION_TTL_SECONDS,
    putSessionSnapshot: putSessionSnapshot,
    getSessionSnapshot: getSessionSnapshot,
    removeSessionSnapshot: removeSessionSnapshot
  };
}