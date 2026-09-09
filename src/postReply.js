/**
 * Ticket 09 — posting a reply.
 * Reuses validateArticleContent/escapeFormulaInjection from
 * postArticle.js — replies share the same 10,000-char content rule and
 * the same formula-injection guard as articles.
 *
 * Perf-optimization ticket 02: createReply/createReplyForRole each read
 * the Articles sheet at most once per call. The single read pulls
 * columns A:I (articleId, boardId, ..., replyCount) in one range call,
 * so the row number, the board's AllowRoles gate, and the current
 * replyCount value all come from the same read — no separate lookup
 * for "find the row" vs "find the boardId" vs "read the current count
 * before incrementing it".
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;
var _mentionsModule = (typeof require !== 'undefined') ? require('./mentions') : null;

function recordMentionsForContentFor_(spreadsheet, lock, params) {
  return (_mentionsModule ? _mentionsModule.recordMentionsForContent_ : recordMentionsForContent_)(spreadsheet, lock, params);
}

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions : getRolePermissions)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

function incrementUserStatFor_(usersSheet, userId, statName, delta) {
  return (_userStatsModule ? _userStatsModule.incrementUserStat : incrementUserStat)(usersSheet, userId, statName, delta);
}

function validateArticleContentFor_(content) {
  return (_postArticleModule ? _postArticleModule.validateArticleContent : validateArticleContent)(content);
}

function escapeFormulaInjectionFor_(value) {
  return (_postArticleModule ? _postArticleModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

/**
 * Finds an article's row number, boardId, title, and current replyCount in
 * a single read of columns A:I, skipping the header row. Returns null if
 * articleId isn't found. Used by both createReply (row + replyCount) and
 * createReplyForRole (also needs boardId for the AllowRoles gate, and
 * title for the @提及輪 ticket 05 mention notification's article-title
 * field — title was already sitting in this same read, just not exposed
 * until now).
 */
function findArticleInfoForReply_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return { row: i + 2, boardId: rows[i][1], title: rows[i][2], replyCount: rows[i][8] };
    }
  }
  return null;
}

/**
 * Writes a new Replies row and increments the matching Articles row's
 * replyCount using an already-known row + current count (from
 * findArticleInfoForReply_, read moments earlier under the same held
 * lock — safe, since nothing else can shift Articles rows while this
 * lock is held). Both writes happen inside the same lock as the caller.
 */
function writeReplyAtRow_(spreadsheet, articlesSheet, articleInfo, input) {
  var repliesSheet = spreadsheet.getSheetByName('Replies');
  repliesSheet.appendRow([
    input.replyId,
    input.articleId,
    input.author,
    escapeFormulaInjectionFor_(input.content),
    "'" + input.createdAt
  ]);

  articlesSheet.getRange(articleInfo.row, 9, 1, 1).setValues([[articleInfo.replyCount + 1]]);

  incrementUserStatFor_(spreadsheet.getSheetByName('Users'), input.author, 'replyCount', 1);

  return { success: true };
}

/**
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
    var articleInfo = findArticleInfoForReply_(articlesSheet, input.articleId);
    if (articleInfo === null) {
      return { success: false, error: '文章不存在' };
    }
    return writeReplyAtRow_(spreadsheet, articlesSheet, articleInfo, input);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Role needs the replyPost permission AND the AllowRoles of the board
 * the target article belongs to must allow it. boardAllowsRoleByIdFor_
 * already bypasses AllowRoles for admin internally, and admin naturally
 * has replyPost=true in the Permission sheet by default — no separate
 * isAdmin branch needed here (unlike editArticleForRole/
 * deleteArticleForRole, which carry the extra "manage someone else's
 * content" bypass that posting doesn't have).
 *
 * The AllowRoles gate is checked inside the lock (using the same
 * Articles read as the row/replyCount lookup) rather than before
 * acquiring it. replyPost is a global, board-independent permission
 * check, so it still short-circuits before touching the lock at all;
 * only the board-specific gate — which needs to know the article's
 * boardId — waits until the read that also finds the row happens.
 */
function createReplyForRole(spreadsheet, lock, role, input) {
  if (!getRolePermissionsFor_(spreadsheet, role).replyPost) {
    return { success: false, error: '權限不足' };
  }
  var contentCheck = validateArticleContentFor_(input.content);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error };
  }

  // @提及輪 ticket 05：result／articleInfo 提到 try 區塊外面宣告，區塊內
  // 一律「賦值後 fall through」而不是 return——這樣鎖一定會走到下面的
  // finally 釋放掉，再往下才呼叫 recordMentionsForContentFor_（它自己會
  // 再取一次同一個 lock）。改成巢狀在 try 裡面呼叫的話，鎖還沒放掉就再要
  // 一次同一把 script lock，GAS 的 lock 不是可重入鎖，會直接卡死到逾時。
  var result;
  var articleInfo = null;
  lock.waitLock(10000);
  try {
    var articlesSheet = spreadsheet.getSheetByName('Articles');
    articleInfo = findArticleInfoForReply_(articlesSheet, input.articleId);
    if (articleInfo === null) {
      result = { success: false, error: '文章不存在' };
    } else if (!boardAllowsRoleByIdFor_(spreadsheet, articleInfo.boardId, role)) {
      result = { success: false, error: '權限不足' };
    } else {
      result = writeReplyAtRow_(spreadsheet, articlesSheet, articleInfo, input);
    }
  } finally {
    lock.releaseLock();
  }

  if (result.success) {
    recordMentionsForContentFor_(spreadsheet, lock, {
      text: input.content,
      mentionedBy: input.author,
      boardId: articleInfo.boardId,
      articleId: input.articleId,
      articleTitle: articleInfo.title,
      timestamp: input.createdAt
    });
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createReply: createReply, createReplyForRole: createReplyForRole };
}
