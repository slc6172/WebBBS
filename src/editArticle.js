/**
 * Ticket 10 — editing your own article.
 * Reuses validateArticleTitle/validateArticleContent/escapeFormulaInjection
 * from postArticle.js — edits follow the same rules as new posts.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

function validateArticleTitleFor_(title) {
  return (_postArticleModule ? _postArticleModule.validateArticleTitle : validateArticleTitle)(title);
}

function validateArticleContentFor_(content) {
  return (_postArticleModule ? _postArticleModule.validateArticleContent : validateArticleContent)(content);
}

function escapeFormulaInjectionFor_(value) {
  return (_postArticleModule ? _postArticleModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

/**
 * Finds the row number and current author for an articleId, or null.
 */
function findArticleRowAndAuthor_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues(); // A=articleId, D=author
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return { rowNumber: i + 2, author: rows[i][3] };
    }
  }
  return null;
}

/**
 * Overwrites title/content/editedAt/editedBy on an existing article.
 * No lock: this overwrites specific cells on an already-existing row
 * rather than inserting new data or maintaining a counter, so a
 * last-write-wins race between two overlapping edits doesn't corrupt
 * anything structurally — it's an ordinary edit conflict, same as any
 * shared document.
 * @param {Spreadsheet} spreadsheet
 * @param {string} requestingUserId
 * @param {string} articleId
 * @param {{title: string, content: string, editedAt: string}} updates
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId
 *   check (ticket 12); editedBy is still requestingUserId (the admin who
 *   made the edit), not the original author.
 * @returns {{success: boolean, error?: string}}
 */
function editArticle(spreadsheet, requestingUserId, articleId, updates, isAdmin) {
  var sheet = spreadsheet.getSheetByName('Articles');
  var found = findArticleRowAndAuthor_(sheet, articleId);
  if (!found) {
    return { success: false, error: '文章不存在' };
  }
  if (!isAdmin && found.author !== requestingUserId) {
    return { success: false, error: '權限不足' };
  }

  var titleCheck = validateArticleTitleFor_(updates.title);
  if (!titleCheck.valid) {
    return { success: false, error: titleCheck.error };
  }
  var contentCheck = validateArticleContentFor_(updates.content);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error };
  }

  var row = found.rowNumber;
  sheet.getRange(row, 3, 1, 1).setValues([[escapeFormulaInjectionFor_(updates.title)]]); // C=title
  sheet.getRange(row, 5, 1, 1).setValues([[escapeFormulaInjectionFor_(updates.content)]]); // E=content
  sheet.getRange(row, 7, 1, 1).setValues([["'" + updates.editedAt]]); // G=editedAt (force plain text, same fix as createdAt elsewhere)
  sheet.getRange(row, 8, 1, 1).setValues([[requestingUserId]]); // H=editedBy

  return { success: true };
}

/**
 * Only role=user/admin may edit at all; the ownership check inside
 * editArticle still applies on top of this.
 */
function editArticleForRole(spreadsheet, role, requestingUserId, articleId, updates) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { success: false, error: '權限不足' };
  }
  return editArticle(spreadsheet, requestingUserId, articleId, updates, role === 'admin');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { editArticle: editArticle, editArticleForRole: editArticleForRole };
}
