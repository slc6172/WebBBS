/**
 * Ticket 05 — board listing. Boards are only ever created/edited by the
 * admin directly on the spreadsheet, so there is deliberately no
 * createBoard/updateBoard function anywhere in this codebase — this
 * file only reads.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

/**
 * @param {Spreadsheet} spreadsheet
 * @returns {{boardId: string, boardName: string, description: string, sortOrder: number}[]}
 *   sorted ascending by sortOrder
 */
function listBoards(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('Boards');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var boards = rows.map(function (row) {
    return {
      boardId: row[0],
      boardName: row[1],
      description: row[2],
      sortOrder: row[3]
    };
  });
  boards.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  return boards;
}

/**
 * Only role=user/admin get the real board list; anyone else (newbie or
 * not logged in) gets an empty array.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @returns {Array}
 */
function getBoardsForRole(spreadsheet, role) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return [];
  }
  return listBoards(spreadsheet);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { listBoards: listBoards, getBoardsForRole: getBoardsForRole };
}