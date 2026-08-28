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

/**
 * Looks up the role for the user behind a session token. Deliberately
 * re-reads the Users sheet on every call rather than caching the role
 * alongside the token, so an admin's change to a user's role (made
 * directly on the spreadsheet) takes effect on the very next call —
 * no waiting for the session to expire.
 * @param {Cache} cache
 * @param {Spreadsheet} spreadsheet
 * @param {string} token
 * @returns {string|null} the user's current role, or null if the token
 *   doesn't map to a logged-in user
 */
function getSessionRole(cache, spreadsheet, token) {
  var userId = cache.get(sessionPrefixFor_() + token);
  if (!userId) {
    return null;
  }
  var sheet = spreadsheet.getSheetByName('Users');
  var record = getUserRecordFor_(sheet, userId);
  return record ? record.role : null;
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
function getRolePermissions(spreadsheet, role) {
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
    getSessionRole: getSessionRole,
    gateByRole: gateByRole,
    getRolePermissions: getRolePermissions,
    snapshotIncludesBoard: snapshotIncludesBoard,
    snapshotAllowsBoardArticleRead: snapshotAllowsBoardArticleRead
  };
}