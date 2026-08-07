// GAS entry point. Wires the unit-tested seam functions in schema.js /
// ping.js / bootstrap.js to the real GAS APIs (SpreadsheetApp,
// HtmlService). All .js files in a clasp project share one global
// namespace at runtime, so ensureSchema / pingRoundTrip /
// parseBootstrapParams are directly callable here without any import.
//
// This file is intentionally thin glue: it is NOT covered by the Node
// unit tests (SpreadsheetApp/HtmlService only exist inside the Apps
// Script runtime), so it's verified manually — see MANUAL_VERIFICATION.md.

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  ensureSchema(getSpreadsheet_());

  var bootstrapData = parseBootstrapParams(e);
  var template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapDataJson = JSON.stringify(bootstrapData);
  template.scriptUrlJson = JSON.stringify(ScriptApp.getService().getUrl()); // 新增：真正對外的 /exec 網址

  return template.evaluate()
    .setTitle('BBS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Callable from the page via google.script.run to register a new user.
 * Generates salt/createdAt here (system clock + randomness are GAS-only
 * concerns) and wires the real Utilities/LockService into registerUser,
 * which itself stays pure and unit-testable.
 */
function registerUserFromForm(userId, password) {
  var salt = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var lock = LockService.getScriptLock();
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };

  return registerUser(getSpreadsheet_(), lock, digestFn, {
    userId: userId,
    password: password,
    salt: salt,
    createdAt: createdAt
  });
}

/**
 * Callable from the page via google.script.run to check the current
 * session's role. Always re-reads the Users sheet (see permissions.js),
 * so an admin's role change on the spreadsheet takes effect immediately.
 * Also returns userId so the frontend can decide, e.g., whether to show
 * an "edit" button on a given article (owner-only).
 */
function getMyStatus(token) {
  var cache = CacheService.getScriptCache();
  var role = getSessionRole(cache, getSpreadsheet_(), token);
  var userId = cache.get(SESSION_PREFIX + token);
  return { role: role, userId: userId };
}

/**
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh (see permissions.js) and returns the board list
 * only if that role passes the gate; empty array otherwise.
 */
function getBoardsFromToken(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  return JSON.stringify(getBoardsForRole(ss, role));
}

/**
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh and returns the article list for boardId only if
 * that role passes the gate; empty array otherwise.
 */
function getArticlesFromToken(token, boardId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var articles = getArticlesForRole(ss, role, boardId);
  return JSON.stringify(articles); // 改成回傳字串，繞過物件陣列序列化限制
}

/**
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh; a disallowed role and a deleted/missing article
 * both come back as {article: null, replies: []} (see
 * getArticleDetailForRole's own doc comment for why that's deliberate).
 */
function getArticleDetailFromToken(token, articleId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  return JSON.stringify(getArticleDetailForRole(ss, role, articleId));
}

/**
 * Callable from the page via google.script.run to delete a reply.
 * Admin-only (see deleteReplyForRole's ['admin']-only allow list) — no
 * ownership check, since per spec even the reply's own author can never
 * delete it themselves.
 */
function deleteReplyFromForm(token, articleId, replyId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var lock = LockService.getScriptLock();

  return deleteReplyForRole(ss, lock, role, articleId, replyId);
}

/**
 * Callable from the page via google.script.run to delete your own
 * article (cascades to its replies). requestingUserId comes from the
 * session, same pattern as edit/post. When role is admin,
 * deleteArticleForRole internally bypasses the ownership check.
 */
function deleteArticleFromForm(token, articleId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var requestingUserId = cache.get(SESSION_PREFIX + token);
  var lock = LockService.getScriptLock();

  return deleteArticleForRole(ss, lock, role, requestingUserId, articleId);
}

/**
 * Callable from the page via google.script.run to edit an article.
 * requestingUserId comes from the session, same as postArticleFromForm's
 * author — the client can't claim to be someone else. editedAt is
 * generated here for the same reason as elsewhere. When role is admin,
 * editArticleForRole internally bypasses the ownership check (editedBy
 * still records the admin, not the original author).
 */
function editArticleFromForm(token, articleId, title, content) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var requestingUserId = cache.get(SESSION_PREFIX + token);
  var editedAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  return editArticleForRole(ss, role, requestingUserId, articleId, {
    title: title,
    content: content,
    editedAt: editedAt
  });
}

/**
 * Callable from the page via google.script.run to post a new article.
 * SECURITY NOTE: author is looked up from the session token via the
 * cache, never accepted as a parameter from the client — this is the
 * actual place "the frontend can't spoof who posted this" is enforced.
 * articleId/createdAt are generated here for the same reason ticket 01's
 * pingRoundTrip and ticket 02's registerUser take them as input: the
 * core logic in postArticle.js stays free of system-clock/randomness
 * calls and is unit-testable.
 */
function postArticleFromForm(token, boardId, title, content) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var author = cache.get(SESSION_PREFIX + token); // the verified userId, not a form field
  var lock = LockService.getScriptLock();
  var articleId = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  return createArticleForRole(ss, lock, role, {
    articleId: articleId,
    boardId: boardId,
    title: title,
    content: content,
    author: author,
    createdAt: createdAt
  });
}

/**
 * Callable from the page via google.script.run to post a reply.
 * Same author-from-session-token pattern as postArticleFromForm — the
 * client never gets to say who it's posting as.
 */
function postReplyFromForm(token, articleId, content) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var author = cache.get(SESSION_PREFIX + token);
  var lock = LockService.getScriptLock();
  var replyId = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  return createReplyForRole(ss, lock, role, {
    replyId: replyId,
    articleId: articleId,
    author: author,
    content: content,
    createdAt: createdAt
  });
}

/**
 * Callable from the page via google.script.run to log a user in.
 */
function loginFromForm(userId, password) {
  var cache = CacheService.getScriptCache();
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };
  var tokenGenerator = function () {
    return Utilities.getUuid();
  };

  return login(getSpreadsheet_(), cache, tokenGenerator, digestFn, {
    userId: userId,
    password: password
  });
}

/**
 * Callable from the page via google.script.run to log the current
 * session out. Removes the token from CacheService so it can no longer
 * be used to authenticate any request, even if the client still has it
 * cached somewhere.
 */
function logoutFromForm(token) {
  var cache = CacheService.getScriptCache();
  cache.remove(SESSION_PREFIX + token);
}

/**
 * Callable from the page via google.script.run to manually verify the
 * write -> read path against the real spreadsheet (ticket 01's
 * "walking skeleton" proof).
 */
function runPingCheck() {
  var value = 'ping-' + new Date().getTime();
  return pingRoundTrip(getSpreadsheet_(), value);
}