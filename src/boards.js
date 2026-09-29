/**
 * Ticket 05 — board listing. Boards are only ever created/edited by the
 * admin directly on the spreadsheet, so there is deliberately no
 * createBoard/updateBoard function anywhere in this codebase — this
 * file only reads.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
}

/**
 * @param {Spreadsheet} spreadsheet
 * @returns {{boardId: string, boardName: string, description: string, sortOrder: number, latestArticleAt: string, latestReplyAt: string, allowRoles: string}[]}
 *   sorted ascending by sortOrder. latestArticleAt/latestReplyAt feed the
 *   board-list new-content indicator (見對話紀錄); blank when the board has
 *   never had an article/reply posted since those columns were added.
 *   allowRoles is the raw AllowRoles cell content (blank / "ALL" /
 *   comma-separated role list) — see boardAllowsRole() for how it's
 *   interpreted. Deliberately included in this same bulk read rather than
 *   fetched per-board, consistent with this project's stance on avoiding
 *   extra full-sheet round trips.
 */
function listBoards(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('Boards');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var boards = rows.map(function (row) {
    return {
      boardId: row[0],
      boardName: row[1],
      description: row[2],
      sortOrder: row[3],
      latestArticleAt: row[4] || '',
      latestReplyAt: row[5] || '',
      allowRoles: row[6] || ''
    };
  });
  boards.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  return boards;
}

/**
 * Only roles with the Permission sheet's articleRead permission get the
 * real board list; anyone else (e.g. newbie, or an unknown role) gets an
 * empty array. Each board is additionally filtered by its own AllowRoles
 * value — admin bypasses this per-board filter entirely (see
 * boardAllowsRole's docstring for why that bypass lives here, not there).
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @returns {Array}
 */
function getBoardsForRole_(spreadsheet, role) {
  if (!getRolePermissionsFor_(spreadsheet, role).articleRead) {
    return [];
  }
  return listBoards(spreadsheet).filter(function (board) {
    return role === 'admin' || boardAllowsRole(board.allowRoles, role);
  });
}

/**
 * Board-level access decision for the AllowRoles column — pure string
 * logic, deliberately takes no spreadsheet so it can be applied against
 * boards already fetched in bulk (see listBoards) without any extra
 * per-board sheet reads. Does NOT special-case admin — the admin bypass
 * (per confirmed design: admin ignores AllowRoles entirely) is the
 * caller's responsibility, same pattern as the existing isAdmin bypass in
 * editArticle.js/deleteArticle.js.
 * @param {string} allowRolesValue - raw AllowRoles cell content
 * @param {string} role
 * @returns {boolean}
 */
function boardAllowsRole(allowRolesValue, role) {
  if (!allowRolesValue) {
    return false; // blank = nobody (except admin, handled by the caller)
  }
  var trimmed = String(allowRolesValue).trim();
  if (trimmed.toUpperCase() === 'ALL') {
    return true; // no extra restriction beyond whatever global permission the caller already checked
  }
  var roles = trimmed.split(',').map(function (r) { return r.trim(); });
  return roles.indexOf(role) !== -1;
}

/**
 * I/O wrapper around boardAllowsRole — looks up boardId's AllowRoles via
 * listBoards, applies the admin bypass (admin never checks AllowRoles at
 * all, per confirmed design), then delegates to the pure decision logic.
 * A boardId that doesn't match any existing board denies everyone except
 * admin, same as a board with blank AllowRoles.
 *
 * This is the shared seam future tickets (post/edit/delete article, post/
 * delete reply) all call — "does this role get to touch this board" is
 * the exact same question in every one of those cases.
 * @param {Spreadsheet} spreadsheet
 * @param {string} boardId
 * @param {string|null} role
 * @returns {boolean}
 */
function boardAllowsRoleById(spreadsheet, boardId, role) {
  if (role === 'admin') {
    return true;
  }
  var boards = listBoards(spreadsheet);
  var board = null;
  for (var i = 0; i < boards.length; i++) {
    if (boards[i].boardId === boardId) {
      board = boards[i];
      break;
    }
  }
  return boardAllowsRole(board ? board.allowRoles : '', role);
}

/**
 * Packages a role's read-path permission decision into one shape:
 * its 8 permission flags plus the boardIds it's currently allowed to
 * browse. Delegates entirely to getRolePermissionsFor_ and
 * getBoardsForRole above — no new judgment logic, just combines their
 * existing answers so Code.js's getMyStatus can cache the result once
 * per page load (perf-optimization ticket 03) instead of every caller
 * re-deriving it on every read.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @returns {{permissions: Object, allowedBoardIds: string[]}}
 */
function buildRoleSnapshot(spreadsheet, role) {
  return {
    permissions: getRolePermissionsFor_(spreadsheet, role),
    allowedBoardIds: getBoardsForRole_(spreadsheet, role).map(function (b) { return b.boardId; })
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { listBoards: listBoards, getBoardsForRole_: getBoardsForRole_, boardAllowsRole: boardAllowsRole, boardAllowsRoleById: boardAllowsRoleById, buildRoleSnapshot: buildRoleSnapshot };
}