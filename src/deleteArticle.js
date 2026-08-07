/**
 * Ticket 11 — deleting your own article (cascades to its replies).
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
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
 * Finds every row number in a Replies-shaped sheet belonging to
 * articleId, in ascending row order.
 */
function findReplyRowNumbers_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // A=replyId, B=articleId
  var rowNumbers = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] === articleId) {
      rowNumbers.push(i + 2);
    }
  }
  return rowNumbers;
}

/**
 * Deletes an article and every reply under it, all inside one lock.
 * Locked (unlike editArticle) because deleteRow shifts every
 * subsequent row's number — an overlapping delete elsewhere in the
 * sheet could otherwise target the wrong row once numbers move.
 * Reply rows are deleted bottom-up so removing one doesn't shift the
 * row numbers of the ones still queued for deletion.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} requestingUserId
 * @param {string} articleId
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId
 *   check (ticket 12).
 * @returns {{success: boolean, error?: string}}
 */
function deleteArticle(spreadsheet, lock, requestingUserId, articleId, isAdmin) {
  lock.waitLock(10000);
  try {
    var articlesSheet = spreadsheet.getSheetByName('Articles');
    var found = findArticleRowAndAuthor_(articlesSheet, articleId);
    if (!found) {
      return { success: false, error: '文章不存在' };
    }
    if (!isAdmin && found.author !== requestingUserId) {
      return { success: false, error: '權限不足' };
    }

    articlesSheet.deleteRow(found.rowNumber);

    var repliesSheet = spreadsheet.getSheetByName('Replies');
    var replyRowNumbers = findReplyRowNumbers_(repliesSheet, articleId);
    for (var i = replyRowNumbers.length - 1; i >= 0; i--) {
      repliesSheet.deleteRow(replyRowNumbers[i]);
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Only role=user/admin may delete at all; the ownership check inside
 * deleteArticle still applies on top of this.
 */
function deleteArticleForRole(spreadsheet, lock, role, requestingUserId, articleId) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { success: false, error: '權限不足' };
  }
  return deleteArticle(spreadsheet, lock, requestingUserId, articleId, role === 'admin');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deleteArticle: deleteArticle, deleteArticleForRole: deleteArticleForRole };
}