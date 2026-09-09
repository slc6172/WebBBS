// The BBS + LINE digest sheets and their header rows, per spec.
var SHEET_HEADERS = {
  Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt', 'loginCount', 'lastLoginAt', 'articleCount', 'replyCount', 'lastSeenBoards', 'pendingMentions'],
  Boards: ['boardId', 'boardName', 'description', 'sortOrder', 'latestArticleAt', 'latestReplyAt', 'AllowRoles'],
  Articles: ['articleId', 'boardId', 'title', 'author', 'content', 'createdAt', 'editedAt', 'editedBy', 'replyCount', 'imageUrls'],
  Replies: ['replyId', 'articleId', 'author', 'content', 'createdAt'],
  Permission: ['role', 'articleRead', 'articlePost', 'articleManageOwn', 'replyRead', 'replyPost', 'replyDeleteOwn', 'leaderboard', 'login'],
  LineGroupBoards: ['groupId', 'groupName', 'boardId', 'lastDigestDate', 'todayDigestCount'],
  LineStaging: ['groupId', 'messageTime', 'displayName', 'messageType', 'content', 'webhookEventId', 'recalled'],
  LineUserId: ['userId', 'displayId']
};

// 1-indexed column numbers that hold timestamp strings (e.g.
// "2026/08/01 12:34:56"). These MUST be forced to plain-text ("@") number
// format, otherwise Sheets auto-detects the date-like pattern on write and
// silently converts the cell to a Date/serial value. getValues() then
// returns a JS Date instead of the original string, which breaks every
// piece of downstream code (sort comparisons, google.script.run
// round-trips, frontend string handling) that expects createdAt/editedAt
// to stay a plain string.
var TIMESTAMP_COLUMNS = {
  Users: [5, 7],       // createdAt, lastLoginAt（優化輪 ticket 07）——lastSeenBoards（第 10 欄）是 JSON 不是時間戳記，不用鎖純文字
  Boards: [5, 6],      // latestArticleAt, latestReplyAt（看板新內容提示功能）
  Articles: [6, 7],    // createdAt, editedAt
  Replies: [5],        // createdAt
  LineGroupBoards: [4], // lastDigestDate
  LineStaging: [2]      // messageTime
};

// Default Permission rows written the first time the Permission sheet is
// created — mirrors today's hardcoded gateByRole(['user','admin']) behaviour
// exactly, so shipping this feature doesn't change anything until an admin
// deliberately edits the sheet. Column order matches SHEET_HEADERS.Permission
// (role, articleRead, articlePost, articleManageOwn, replyRead, replyPost,
// replyDeleteOwn, leaderboard, login).
var DEFAULT_PERMISSION_ROWS = [
  ['newbie', false, false, false, false, false, false, false, true],
  ['user', true, true, true, true, true, true, true, true],
  ['admin', true, true, true, true, true, true, true, true]
];

/**
 * Ensures all five BBS sheets exist on the given spreadsheet with the
 * correct header row, that timestamp columns are locked to plain-text
 * format, and that the Permission sheet has sensible defaults the very
 * first time it's created. Safe to call repeatedly (idempotent) — once
 * Permission has any data row, this never touches that data again.
 * @param {Spreadsheet} spreadsheet - a SpreadsheetApp.Spreadsheet, or any
 *   object implementing getSheetByName(name) / insertSheet(name).
 * @param {function(string[]): *} [buildRoleValidationRule] - optional. If
 *   supplied, called with the current Permission role list and expected to
 *   return a DataValidation-like rule object, which is then applied to the
 *   Users.role column. In real GAS this wraps
 *   SpreadsheetApp.newDataValidation().requireValueInList(roles, true).build()
 *   — that builder lives on the global SpreadsheetApp namespace, not on
 *   anything reachable from the spreadsheet instance, so it can't be called
 *   from inside this file directly without breaking the existing
 *   dependency-injection convention. Omitted entirely by any caller that
 *   doesn't need it (all existing single-arg call sites keep working
 *   unchanged).
 */
function ensureSchema(spreadsheet, buildRoleValidationRule) {
  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    var headers = SHEET_HEADERS[sheetName];
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    // Permission sheet seeding must be decided BEFORE the header write
    // below (which always touches row 1) — getLastRow() <= 1 here means
    // "no data rows beyond the header yet", i.e. a brand-new sheet or one
    // an admin has never populated. Once any data row exists, this branch
    // never runs again for the lifetime of the sheet, no matter how many
    // times ensureSchema is called — an admin's manual edits in Permission
    // must never be silently overwritten on a later page load.
    var needsPermissionSeed = sheetName === 'Permission' && sheet.getLastRow() <= 1;

    // Boards.AllowRoles backfill must also be decided BEFORE the header
    // write below, by checking whether the OLD header already contained
    // this column. A pre-existing deployment's Boards sheet has real board
    // rows written before AllowRoles existed — leaving those blank would
    // mean "nobody but admin can see this board" per the confirmed blank
    // semantics, silently hiding every existing board the moment this
    // ships. Once the column exists, this never runs again — a board
    // added afterwards with AllowRoles left blank is the admin's own
    // deliberate choice, not something to auto-fill.
    var needsAllowRolesBackfill = false;
    if (sheetName === 'Boards') {
      var oldBoardsHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      needsAllowRolesBackfill = oldBoardsHeader.indexOf('AllowRoles') === -1;
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (needsPermissionSeed) {
      DEFAULT_PERMISSION_ROWS.forEach(function (row) {
        sheet.appendRow(row);
      });
    }

    if (needsAllowRolesBackfill) {
      var allowRolesCol = headers.indexOf('AllowRoles') + 1; // 1-indexed
      var boardsLastRow = sheet.getLastRow();
      if (boardsLastRow > 1) {
        var numDataRows = boardsLastRow - 1;
        var fillValues = [];
        for (var r = 0; r < numDataRows; r++) {
          fillValues.push(['ALL']);
        }
        sheet.getRange(2, allowRolesCol, numDataRows, 1).setValues(fillValues);
      }
    }

    var timestampCols = TIMESTAMP_COLUMNS[sheetName];
    if (timestampCols && typeof sheet.getMaxRows === 'function') {
      var maxRows = sheet.getMaxRows();
      if (maxRows > 1) {
        timestampCols.forEach(function (col) {
          sheet.getRange(2, col, maxRows - 1, 1).setNumberFormat('@');
        });
      }
    }
  });

  // Role dropdown on Users.role, sourced from whatever roles Permission
  // actually has right now — run after the loop above so a first-time
  // Permission seed is already in place before we read its role list.
  if (buildRoleValidationRule) {
    var permissionSheet = spreadsheet.getSheetByName('Permission');
    var permissionRowCount = permissionSheet.getLastRow() - 1; // minus header
    var roleNames = [];
    if (permissionRowCount > 0) {
      var roleColumn = permissionSheet.getRange(2, 1, permissionRowCount, 1).getValues();
      roleNames = roleColumn.map(function (row) { return row[0]; });
    }

    var usersSheet = spreadsheet.getSheetByName('Users');
    var usersMaxRows = usersSheet.getMaxRows();
    if (usersMaxRows > 1) {
      usersSheet.getRange(2, 4, usersMaxRows - 1, 1).setDataValidation(buildRoleValidationRule(roleNames));
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ensureSchema: ensureSchema, SHEET_HEADERS: SHEET_HEADERS };
}