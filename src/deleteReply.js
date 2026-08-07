/**
 * Ticket 12 — admin deletes a reply. Deliberately no ownership check
 * here: per spec, replies are never deletable by their own author
 * either, so there is no "is this my reply" branch to take — only an
 * admin can reach this function (see deleteReplyForRole).
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

/**
 * Finds the row number for a reply, or null if not found.
 */
function findReplyRowNumber_(sheet, replyId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === replyId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Finds which row (1-indexed) holds the given articleId in an
 * Articles-shaped sheet, skipping the header row.
 */
function findArticleRowNumber_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === articleId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Deletes a reply row and decrements the parent article's replyCount,
 * both inside the same lock.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} articleId
 * @param {string} replyId
 * @returns {{success: boolean, error?: string}}
 */
function deleteReply(spreadsheet, lock, articleId, replyId) {
  lock.waitLock(10000);
  try {
    var repliesSheet = spreadsheet.getSheetByName('Replies');
    var replyRow = findReplyRowNumber_(repliesSheet, replyId);
    if (replyRow === null) {
      return { success: false, error: '回覆不存在' };
    }

    repliesSheet.deleteRow(replyRow);

    var articlesSheet = spreadsheet.getSheetByName('Articles');
    var articleRow = findArticleRowNumber_(articlesSheet, articleId);
    if (articleRow !== null) {
      var replyCountCell = articlesSheet.getRange(articleRow, 9, 1, 1);
      var currentCount = replyCountCell.getValues()[0][0];
      replyCountCell.setValues([[Math.max(0, currentCount - 1)]]);
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Unlike every other *ForRole gate in this codebase (which allows
 * ['user', 'admin']), this one allows admin ONLY — plain users have no
 * reply-deletion capability at all, not even for their own replies.
 */
function deleteReplyForRole(spreadsheet, lock, role, articleId, replyId) {
  if (!gateByRoleFor_(role, ['admin'])) {
    return { success: false, error: '權限不足' };
  }
  return deleteReply(spreadsheet, lock, articleId, replyId);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deleteReply: deleteReply, deleteReplyForRole: deleteReplyForRole };
}