/**
 * Ticket 09 — posting a reply.
 * Reuses validateArticleContent/escapeFormulaInjection from
 * postArticle.js — replies share the same 10,000-char content rule and
 * the same formula-injection guard as articles.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

function validateArticleContentFor_(content) {
  return (_postArticleModule ? _postArticleModule.validateArticleContent : validateArticleContent)(content);
}

function escapeFormulaInjectionFor_(value) {
  return (_postArticleModule ? _postArticleModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

/**
 * Finds which row (1-indexed) holds the given articleId in an
 * Articles-shaped sheet, skipping the header row. Returns null if not found.
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
 * Writes a new Replies row and increments the matching Articles row's
 * replyCount, both inside the same lock — not two separate locked
 * operations, one try/finally covering both writes.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {{replyId: string, articleId: string, author: string, content: string, createdAt: string}} input
 * @returns {{success: boolean, error?: string}}
 */
function createReply(spreadsheet, lock, input) {
  var contentCheck = validateArticleContentFor_(input.content);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error };
  }

  lock.waitLock(10000);
  try {
    var articlesSheet = spreadsheet.getSheetByName('Articles');
    var articleRow = findArticleRowNumber_(articlesSheet, input.articleId);
    if (articleRow === null) {
      return { success: false, error: '文章不存在' };
    }

    var repliesSheet = spreadsheet.getSheetByName('Replies');
    repliesSheet.appendRow([
      input.replyId,
      input.articleId,
      input.author,
      escapeFormulaInjectionFor_(input.content),
      "'" + input.createdAt
    ]);

    var replyCountCell = articlesSheet.getRange(articleRow, 9, 1, 1);
    var currentCount = replyCountCell.getValues()[0][0];
    replyCountCell.setValues([[currentCount + 1]]);

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Only role=user/admin may reply; anyone else is rejected before any
 * validation, lock, or write happens.
 */
function createReplyForRole(spreadsheet, lock, role, input) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { success: false, error: '權限不足' };
  }
  return createReply(spreadsheet, lock, input);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createReply: createReply, createReplyForRole: createReplyForRole };
}