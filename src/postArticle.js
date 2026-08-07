/**
 * Ticket 07 — posting an article.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function gateByRoleFor_(role, allowedRoles) {
  return (_permissionsModule ? _permissionsModule.gateByRole : gateByRole)(role, allowedRoles);
}

var ARTICLE_TITLE_MAX_LENGTH = 100;
var ARTICLE_CONTENT_MAX_LENGTH = 10000;

/**
 * @param {string} title
 * @returns {{valid: boolean, error?: string}}
 */
function validateArticleTitle(title) {
  if (typeof title !== 'string' || title.length < 1) {
    return { valid: false, error: '標題不能為空' };
  }
  if (title.length > ARTICLE_TITLE_MAX_LENGTH) {
    return { valid: false, error: '標題長度不能超過100字元' };
  }
  return { valid: true };
}

/**
 * @param {string} content
 * @returns {{valid: boolean, error?: string}}
 */
function validateArticleContent(content) {
  if (typeof content !== 'string' || content.length < 1) {
    return { valid: false, error: '內文不能為空' };
  }
  if (content.length > ARTICLE_CONTENT_MAX_LENGTH) {
    return { valid: false, error: '內文長度不能超過10000字元' };
  }
  return { valid: true };
}

var FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@'];

/**
 * Guards against formula injection: if value starts with a character
 * Sheets would interpret as the start of a formula, prefix it with a
 * single quote to force plain-text interpretation. Otherwise returns
 * value unchanged.
 * @param {string} value
 * @returns {string}
 */
function escapeFormulaInjection(value) {
  if (typeof value === 'string' && value.length > 0 && FORMULA_TRIGGER_CHARS.indexOf(value.charAt(0)) !== -1) {
    return "'" + value;
  }
  return value;
}

/**
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {{articleId: string, boardId: string, title: string, content: string, author: string, createdAt: string}} input
 * @returns {{success: boolean, error?: string}}
 */
function createArticle(spreadsheet, lock, input) {
  var titleCheck = validateArticleTitle(input.title);
  if (!titleCheck.valid) {
    return { success: false, error: titleCheck.error };
  }
  var contentCheck = validateArticleContent(input.content);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error };
  }

  lock.waitLock(10000);
  try {
    var sheet = spreadsheet.getSheetByName('Articles');
    sheet.appendRow([
      input.articleId,
      input.boardId,
      escapeFormulaInjection(input.title),
      input.author,
      escapeFormulaInjection(input.content),
      "'" + input.createdAt,
      '',
      '',
      0
    ]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Only role=user/admin may post; anyone else is rejected before any
 * validation or write happens.
 */
function createArticleForRole(spreadsheet, lock, role, input) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { success: false, error: '權限不足' };
  }
  return createArticle(spreadsheet, lock, input);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateArticleTitle: validateArticleTitle,
    validateArticleContent: validateArticleContent,
    escapeFormulaInjection: escapeFormulaInjection,
    createArticle: createArticle,
    createArticleForRole: createArticleForRole
  };
}