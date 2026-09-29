/**
 * Ticket 04 — three-tier permission gate.
 * Reuses login.js's session-lookup helper and prefix constant. Same
 * require pattern as login.js's own reuse of register.js: avoids
 * declaring a local `getUserRecord_` binding that would shadow the GAS
 * global.
 */
var _loginModule = (typeof require !== 'undefined') ? require('./login') : null;
var _schemaModule = (typeof require !== 'undefined') ? require('./schema') : null;

function getUserRecordFor_(sheet, userId) {
  return (_loginModule ? _loginModule.getUserRecord_ : getUserRecord_)(sheet, userId);
}

function sessionPrefixFor_() {
  return _loginModule ? _loginModule.SESSION_PREFIX : SESSION_PREFIX;
}

function sessionVersionPrefixFor_() {
  return _loginModule ? _loginModule.SESSION_VERSION_PREFIX : SESSION_VERSION_PREFIX;
}

function credentialRevocationPrefixFor_() {
  return _loginModule ? _loginModule.CREDENTIAL_REVOCATION_PREFIX : CREDENTIAL_REVOCATION_PREFIX;
}

/**
 * mycr 第 15 輪票 11（見 F-02）：讀取類端點（getBoardsFromToken/
 * getBoardBulkFromToken/getArticleDetailFromToken）用的撤銷檢查——
 * getSessionRole_（寫入路徑）靠即時重讀 Users 表判斷 session 是否已經
 * 因為密碼重設而失效，但讀取路徑刻意不即時查表（這正是這幾個端點原本
 * 效能優化的重點）。這裡改成比對兩把平行 cache key：SESSION_VERSION_
 * PREFIX 存的是「這個 token 核發當下」的版本，CREDENTIAL_REVOCATION_
 * PREFIX 存的是「這個 userId 上一次密碼重設之後」的版本（由
 * resetPassword_ 寫入）——兩者不一致，代表這個 token 是在上一次密碼重設
 * 之前核發的，應該視為已登出。全程只有 cache 讀取，不多讀寫任何一次
 * SpreadsheetApp。
 *
 * 跟 getSessionRole_ 一樣採取 fail-open 的過渡期姿態：revokedVersion
 * 讀到 null（這個 userId 從來沒有被重設過密碼、或撤銷標記本身已經過了
 * 自己的 TTL）時不判定失效——標記的 TTL 刻意設得跟 session token 本身
 * 一樣長（見 CREDENTIAL_REVOCATION_PREFIX 常數旁的說明），所以只要真的
 * 發生過重設，在任何受影響的舊 token 自然過期之前，這個標記都還在。
 * @param {Cache} cache
 * @param {string} token
 * @returns {boolean}
 */
function isSessionValidFor_(cache, token) {
  var userId = cache.get(sessionPrefixFor_() + token);
  if (!userId) {
    return false;
  }
  var sessionVersion = cache.get(sessionVersionPrefixFor_() + token);
  var revokedVersion = cache.get(credentialRevocationPrefixFor_() + userId);
  if (sessionVersion !== null && revokedVersion !== null && sessionVersion !== revokedVersion) {
    return false;
  }
  return true;
}

/**
 * Looks up the role for the user behind a session token. Deliberately
 * re-reads the Users sheet on every call rather than caching the role
 * alongside the token, so an admin's change to a user's role (made
 * directly on the spreadsheet) takes effect on the very next call —
 * no waiting for the session to expire.
 *
 * `/mycr` 深層複掃 Finding 1：這個既有的即時重讀，同時也是撤銷機制的掛載
 * 點——比對 login_ 在這個 token 建立當下存進 SESSION_VERSION_PREFIX 的
 * credentialVersion 快照，跟 Users 表現在這一刻的值是否一致。
 * resetPassword_ 每次重設密碼都會換一個新的 credentialVersion，所以一旦
 * 密碼在這個 token 核發之後被重設過，這裡就會偵測到版本不符，立刻回傳
 * null（跟「查無此 session」用同一套 fail-closed 行為），不用等
 * SESSION_TTL_SECONDS 自然過期。
 *
 * sessionVersion 讀到 null（cache 裡完全沒有這個平行 key）是這個機制上線
 * 那一刻既有的舊 session 才會出現的過渡狀態——這些 token 是在
 * SESSION_VERSION_PREFIX 這個平行 key 存在之前建立的，沒有版本快照可以
 * 比對。這裡選擇放行而不是連帶讓所有舊 session 失效，這批舊 session 反正
 * 也會在 SESSION_TTL_SECONDS（6 小時）內自然過期、之後每一個新登入都會
 * 正常帶有版本快照，這個過渡狀態不會長期存在。
 * @param {Cache} cache
 * @param {Spreadsheet} spreadsheet
 * @param {string} token
 * @returns {string|null} the user's current role, or null if the token
 *   doesn't map to a logged-in user, or the account's password has been
 *   reset since this token was issued
 */
function getSessionRole_(cache, spreadsheet, token) {
  var userId = cache.get(sessionPrefixFor_() + token);
  if (!userId) {
    return null;
  }
  var sheet = spreadsheet.getSheetByName('Users');
  var record = getUserRecordFor_(sheet, userId);
  if (!record) {
    return null;
  }
  var sessionVersion = cache.get(sessionVersionPrefixFor_() + token);
  var currentVersion = String(record.credentialVersion);
  if (sessionVersion !== null && sessionVersion !== currentVersion) {
    return null;
  }
  return record.role;
}

/**
 * The single permission check point every board/article/reply function
 * calls. `role` may be null (not logged in / token expired), in which
 * case it's never in any allowed-roles list, so this correctly rejects.
 * @param {string|null} role
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
function gateByRole(role, allowedRoles) {
  return allowedRoles.indexOf(role) !== -1;
}

/**
 * Looks up every permission for a role from the Permission sheet.
 * Deliberately re-reads the sheet on every call, same reasoning as
 * getSessionRole above — an admin's edit to Permission (made directly on
 * the spreadsheet) must take effect on the very next call.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null|undefined} role
 * @returns {Object} all 8 permission keys (from SHEET_HEADERS.Permission,
 *   minus the leading `role` column) mapped to booleans. Every key is
 *   false if role is null/undefined, or doesn't match any row in the
 *   Permission sheet (unknown role — fails safe, never throws).
 */
function getRolePermissions_(spreadsheet, role) {
  var permissionKeys = (_schemaModule ? _schemaModule.SHEET_HEADERS : SHEET_HEADERS).Permission.slice(1);

  var allFalse = {};
  permissionKeys.forEach(function (key) {
    allFalse[key] = false;
  });

  if (!role) {
    return allFalse;
  }

  var sheet = spreadsheet.getSheetByName('Permission');
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return allFalse; // header only, no roles defined yet
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, 1 + permissionKeys.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === role) {
      var result = {};
      permissionKeys.forEach(function (key, idx) {
        result[key] = !!rows[i][idx + 1];
      });
      return result;
    }
  }

  return allFalse; // role string doesn't match any row — unknown role
}

/**
 * Read-path gate for perf-optimization ticket 03: given a session
 * snapshot (built once per page load by boards.js's buildRoleSnapshot,
 * cached via login.js's putSessionSnapshot/getSessionSnapshot — or
 * null, meaning not logged in / cache entry missing or expired),
 * decides whether a boardId is in the role's allowed-boards list.
 * Deliberately does NOT bake in any specific permission flag (not even
 * articleRead) — callers AND this with whichever flag(s) they actually
 * need, same as the original boardAllowsRoleByIdFor_ + permissions.X
 * pattern this replaces. getBoardsFromToken needs it ANDed with
 * articleRead only; getArticleDetailForSnapshot needs the SAME board
 * check ANDed independently with articleRead (for the article) and
 * replyRead (for the replies) — baking in one specific flag here would
 * make it wrong for the other caller.
 * Fails safe to false when snapshot is null/malformed, same stance as
 * gateByRole(null, ...) above.
 * @param {{permissions: Object, allowedBoardIds: string[]}|null} snapshot
 * @param {string} boardId
 * @returns {boolean}
 */
function snapshotIncludesBoard(snapshot, boardId) {
  if (!snapshot || !snapshot.allowedBoardIds) {
    return false;
  }
  return snapshot.allowedBoardIds.indexOf(boardId) !== -1;
}

/**
 * Read-path gate for board-level bulk operations (perf-optimization
 * ticket 05): articleRead ANDed with board membership, both from the
 * snapshot. This is the same combination getBoardsFromToken needs when
 * filtering a whole board list — that caller now delegates here too,
 * so the "articleRead AND boardId in allowedBoardIds" decision lives
 * in exactly one tested place instead of being re-typed in Code.js.
 * Deliberately distinct from snapshotIncludesBoard (which bakes in no
 * permission flag at all) — see that function's doc comment for why
 * baking in one specific flag isn't right for every caller.
 * @param {{permissions: Object, allowedBoardIds: string[]}|null} snapshot
 * @param {string} boardId
 * @returns {boolean}
 */
function snapshotAllowsBoardArticleRead(snapshot, boardId) {
  return !!(snapshot && snapshot.permissions && snapshot.permissions.articleRead) && snapshotIncludesBoard(snapshot, boardId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSessionRole_: getSessionRole_,
    gateByRole: gateByRole,
    getRolePermissions_: getRolePermissions_,
    snapshotIncludesBoard: snapshotIncludesBoard,
    snapshotAllowsBoardArticleRead: snapshotAllowsBoardArticleRead,
    isSessionValidFor_: isSessionValidFor_
  };
}