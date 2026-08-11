/**
 * Ticket 12 — admin deletes a reply. Deliberately no ownership check
 * here: per spec, replies are never deletable by their own author
 * either, so there is no "is this my reply" branch to take — only an
 * admin can reach this function (see deleteReplyForRole).
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

function incrementUserStatFor_(usersSheet, userId, statName, delta) {
  return (_userStatsModule ? _userStatsModule.incrementUserStat : incrementUserStat)(usersSheet, userId, statName, delta);
}

/**
 * Finds the row number and author for a reply, or null if not found.
 * 優化輪 ticket 08：多帶出 author，刪除時才知道要扣哪個使用者的 replyCount。
 */
function findReplyRowAndAuthor_(sheet, replyId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A=replyId, B=articleId, C=author
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === replyId) {
      return { rowNumber: i + 2, author: rows[i][2] };
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
    var found = findReplyRowAndAuthor_(repliesSheet, replyId);
    if (found === null) {
      return { success: false, error: '回覆不存在' };
    }

    repliesSheet.deleteRow(found.rowNumber);
    incrementUserStatFor_(spreadsheet.getSheetByName('Users'), found.author, 'replyCount', -1);

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