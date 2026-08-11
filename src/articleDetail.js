/**
 * Ticket 08 — article detail page & reply display.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

/**
 * Reads a single article's full record, including content (unlike
 * ticket 06's listArticlesByBoard, which deliberately skips it), plus
 * editedAt/editedBy for the "edited" badge and imageUrl1~3 (optimization
 * ticket 09) for the below-content thumbnails.
 * @param {Spreadsheet} spreadsheet
 * @param {string} articleId
 * @returns {{articleId: string, boardId: string, title: string, author: string, content: string, createdAt: string, editedAt: string, editedBy: string, imageUrl1: string, imageUrl2: string, imageUrl3: string}|null}
 */
function getArticleById(spreadsheet, articleId) {
  var sheet = spreadsheet.getSheetByName('Articles');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return {
        articleId: rows[i][0],
        boardId: rows[i][1],
        title: rows[i][2],
        author: rows[i][3],
        content: rows[i][4],
        createdAt: rows[i][5],
        editedAt: rows[i][6],
        editedBy: rows[i][7],
        imageUrl1: rows[i][9] || '',
        imageUrl2: rows[i][10] || '',
        imageUrl3: rows[i][11] || ''
      };
    }
  }
  return null;
}

/**
 * Reads replies for the given article, oldest first (thread reads
 * top-to-bottom, newest reply naturally lands at the bottom).
 * @param {Spreadsheet} spreadsheet
 * @param {string} articleId
 * @returns {{replyId: string, articleId: string, author: string, content: string, createdAt: string}[]}
 */
function listRepliesByArticle(spreadsheet, articleId) {
  var sheet = spreadsheet.getSheetByName('Replies');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var replies = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] !== articleId) {
      continue;
    }
    replies.push({
      replyId: rows[i][0],
      articleId: rows[i][1],
      author: rows[i][2],
      content: rows[i][3],
      createdAt: rows[i][4]
    });
  }

  replies.sort(function (a, b) {
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? -1 : 1; // oldest first
  });

  return replies;
}

/**
 * Role must pass the gate AND the article must still exist; either
 * failure returns the same empty shape ({article: null, replies: []})
 * so a disallowed role and a deleted article look identical to the
 * caller — deliberately consistent with ticket 11's "deleted article
 * is indistinguishable from never having existed" behavior.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @param {string} articleId
 * @returns {{article: Object|null, replies: Array}}
 */
function getArticleDetailForRole(spreadsheet, role, articleId) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { article: null, replies: [] };
  }
  var article = getArticleById(spreadsheet, articleId);
  if (!article) {
    return { article: null, replies: [] };
  }
  var replies = listRepliesByArticle(spreadsheet, articleId);
  return { article: article, replies: replies };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getArticleById: getArticleById,
    listRepliesByArticle: listRepliesByArticle,
    getArticleDetailForRole: getArticleDetailForRole
  };
}