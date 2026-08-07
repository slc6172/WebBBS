/**
 * Ticket 06 — article listing.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

/**
 * Reads articles for the given board, newest first, deliberately
 * skipping column E (content) via separate range reads rather than
 * reading the whole row and discarding content in JS — this is what
 * keeps the list query from paying for full article bodies.
 * @param {Spreadsheet} spreadsheet
 * @param {string} boardId
 * @returns {{articleId: string, boardId: string, title: string, author: string, createdAt: string, replyCount: number}[]}
 */
function listArticlesByBoard(spreadsheet, boardId) {
  var sheet = spreadsheet.getSheetByName('Articles');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var numDataRows = lastRow - 1;

  // Columns: A=articleId, B=boardId, C=title, D=author, E=content(skipped),
  // F=createdAt, G=editedAt(skipped), H=editedBy(skipped), I=replyCount.
  var idBoardTitleAuthor = sheet.getRange(2, 1, numDataRows, 4).getValues();
  var createdAtColumn = sheet.getRange(2, 6, numDataRows, 1).getValues();
  var replyCountColumn = sheet.getRange(2, 9, numDataRows, 1).getValues();

  var articles = [];
  for (var i = 0; i < numDataRows; i++) {
    var row = idBoardTitleAuthor[i];
    if (row[1] !== boardId) {
      continue;
    }
    articles.push({
      articleId: row[0],
      boardId: row[1],
      title: row[2],
      author: row[3],
      createdAt: createdAtColumn[i][0],
      replyCount: replyCountColumn[i][0]
    });
  }

  articles.sort(function (a, b) {
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? 1 : -1; // newest first
  });

  return articles;
}

/**
 * Only role=user/admin get the real article list; anyone else (newbie
 * or not logged in) gets an empty array.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @param {string} boardId
 * @returns {Array}
 */
function getArticlesForRole(spreadsheet, role, boardId) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return [];
  }
  return listArticlesByBoard(spreadsheet, boardId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    listArticlesByBoard: listArticlesByBoard,
    getArticlesForRole: getArticlesForRole
  };
}