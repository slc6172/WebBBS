/**
 * Deleting a reply. Non-admin roles may delete their own reply when
 * granted the replyDeleteOwn permission (ticket 07 of the permission
 * system) — this reverses the original spec rule that nobody but admin
 * could ever delete a reply; that rule is now this Permission-sheet
 * default rather than a hardcoded limit.
 *
 * Perf-optimization ticket 02: deleteReply/deleteReplyForRole each read
 * the Articles sheet at most once per call. The single read pulls
 * columns A:I (articleId, boardId, ..., replyCount) in one range call,
 * so the AllowRoles gate and the current replyCount value both come
 * from the same read. For deleteReplyForRole's non-admin path, that
 * read happens once, inside the lock, and its result is reused for
 * both the gate and the eventual decrement — never read again — via
 * deleteReplyUnlocked_ below (same "unlocked core, thin locked
 * wrappers" convention as postArticle.js's createArticleUnlocked_, so
 * neither caller needs to acquire the lock twice).
 *
 * 安全性審查 H2 修復後更新：Replies 一定先於 Articles 被讀取(用
 * replyId 找到回覆後,才用回覆自己真正的 articleId 去查 Articles),
 * 而不是先讀 Articles 再讀 Replies。這個調換不影響上面說的「各自最多
 * 讀一次」——總讀取次數不變,只是決定「用誰的 articleId 去查
 * Articles」這件事,不再信任客戶端傳入的 articleId 參數(否則能繞過
 * AllowRoles 閘門、也會讓 replyCount 錯扣在別的文章上)。
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions : getRolePermissions)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

function incrementUserStatFor_(usersSheet, userId, statName, delta) {
  return (_userStatsModule ? _userStatsModule.incrementUserStat : incrementUserStat)(usersSheet, userId, statName, delta);
}

/**
 * Finds the row number, real parent articleId, and author for a reply,
 * or null if not found.
 * 優化輪 ticket 08：多帶出 author,刪除時才知道要扣哪個使用者的 replyCount。
 * 安全性審查 H2 修復：多帶出 articleId(B 欄,本來就在同一次 range read
 * 裡讀到,只是原本沒被使用)——呼叫端必須拿這個「回覆真正所屬的文章
 * ID」去做後續的權限閘門判斷跟 replyCount 增減,不能信任客戶端另外
 * 傳入的 articleId 參數,否則能用「有權限看板的文章 ID」搭配「自己
 * 在別的看板寫的回覆 ID」組合繞過看板層級的權限檢查,也會讓
 * replyCount 被錯誤地扣在不相干的文章上(見審查報告 H2)。
 */
function findReplyRowAndAuthor_(sheet, replyId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A=replyId, B=articleId, C=author
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === replyId) {
      return { rowNumber: i + 2, articleId: rows[i][1], author: rows[i][2] };
    }
  }
  return null;
}

/**
 * Finds an article's row number, boardId, and current replyCount in a
 * single read of columns A:I, skipping the header row. Returns null if
 * articleId isn't found.
 */
function findArticleInfoForReply_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return { row: i + 2, boardId: rows[i][1], replyCount: rows[i][8] };
    }
  }
  return null;
}

/**
 * The actual delete: removes the reply row, decrements the reply
 * author's stat, and — using an already-known {row, replyCount} found
 * moments earlier under the same held lock — decrements the parent
 * article's replyCount. No validation, no locking, no re-reading
 * Articles: callers that already hold the lock for their own critical
 * section call this directly.
 */
function deleteReplyUnlocked_(spreadsheet, found, articleInfo) {
  var repliesSheet = spreadsheet.getSheetByName('Replies');
  repliesSheet.deleteRow(found.rowNumber);
  incrementUserStatFor_(spreadsheet.getSheetByName('Users'), found.author, 'replyCount', -1);

  if (articleInfo !== null) {
    var articlesSheet = spreadsheet.getSheetByName('Articles');
    articlesSheet.getRange(articleInfo.row, 9, 1, 1).setValues([[Math.max(0, articleInfo.replyCount - 1)]]);
  }

  return { success: true };
}

/**
 * Deletes a reply row and decrements the parent article's replyCount,
 * both inside the same lock. Non-admin requesters may only delete a
 * reply they themselves authored — mirrors deleteArticle.js's ownership
 * check exactly (same shape, same admin bypass convention).
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} requestingUserId
 * @param {string} articleId
 * @param {string} replyId
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId check.
 * @returns {{success: boolean, error?: string}}
 */
function deleteReply(spreadsheet, lock, requestingUserId, articleId, replyId, isAdmin) {
  lock.waitLock(10000);
  try {
    var repliesSheet = spreadsheet.getSheetByName('Replies');
    var found = findReplyRowAndAuthor_(repliesSheet, replyId);
    if (found === null) {
      return { success: false, error: '回覆不存在' };
    }
    // 安全性審查 H2 修復：見 findReplyRowAndAuthor_ 的註解。這裡不管是
    // admin 還是一般使用者呼叫,只要客戶端傳入的 articleId 跟這則回覆
    // 實際所屬的文章不符,一律視為資料異常直接拒絕,不嘗試「猜測哪個
    // 才是對的」。
    if (found.articleId !== articleId) {
      return { success: false, error: '回覆與文章不符' };
    }
    if (!isAdmin && found.author !== requestingUserId) {
      return { success: false, error: '權限不足' };
    }

    var articleInfo = findArticleInfoForReply_(spreadsheet.getSheetByName('Articles'), found.articleId);
    return deleteReplyUnlocked_(spreadsheet, found, articleInfo);
  } finally {
    lock.releaseLock();
  }
}

/**
 * admin bypasses everything below (Permission table + AllowRoles), same
 * hardcoded special case as editArticle.js/deleteArticle.js — and
 * delegates straight to deleteReply, which already reads Articles only
 * once. Non-admin roles need the replyDeleteOwn permission AND the
 * AllowRoles of the board the reply's parent article belongs to; that
 * check happens inside the lock (not before acquiring it), sharing the
 * same Articles read used for the eventual replyCount decrement — see
 * the file header comment for why this reads Articles once instead of
 * twice, and why the gate can't safely move before lock acquisition.
 * This path does not delegate to deleteReply (that would mean waiting
 * on the same lock twice); it calls the shared deleteReplyUnlocked_
 * directly instead, same convention as createArticleUnlocked_.
 */
function deleteReplyForRole(spreadsheet, lock, role, requestingUserId, articleId, replyId) {
  if (role === 'admin') {
    return deleteReply(spreadsheet, lock, requestingUserId, articleId, replyId, true);
  }
  if (!getRolePermissionsFor_(spreadsheet, role).replyDeleteOwn) {
    return { success: false, error: '權限不足' };
  }

  lock.waitLock(10000);
  try {
    // 安全性審查 H2 修復：改成先查回覆本身(用 replyId),從同一次讀取
    // 裡順便拿到它「真正所屬」的 articleId,再用這個真實值去查文章、
    // 做看板層級的 AllowRoles 閘門判斷 —— 不再相信客戶端傳入的
    // articleId 參數。讀取次數跟修復前完全一樣(Replies 一次、
    // Articles 一次),只是把兩次讀取的順序對調,讓「哪個文章的
    // AllowRoles 說了算」這件事由回覆自己的真實歸屬決定,不是由客戶端
    // 講什麼就是什麼。修復前的舊行為等於允許用「有權限看板的文章 ID」
    // 搭配「自己在別的看板寫的回覆 ID」組合繞過這道閘門(見審查報告
    // H2)。
    var repliesSheet = spreadsheet.getSheetByName('Replies');
    var found = findReplyRowAndAuthor_(repliesSheet, replyId);
    if (found === null) {
      return { success: false, error: '回覆不存在' };
    }
    if (found.articleId !== articleId) {
      return { success: false, error: '回覆與文章不符' };
    }
    if (found.author !== requestingUserId) {
      return { success: false, error: '權限不足' };
    }

    var articlesSheet = spreadsheet.getSheetByName('Articles');
    var articleInfo = findArticleInfoForReply_(articlesSheet, found.articleId);
    if (articleInfo === null) {
      return { success: false, error: '文章不存在' };
    }
    if (!boardAllowsRoleByIdFor_(spreadsheet, articleInfo.boardId, role)) {
      return { success: false, error: '權限不足' };
    }

    return deleteReplyUnlocked_(spreadsheet, found, articleInfo);
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deleteReply: deleteReply, deleteReplyForRole: deleteReplyForRole };
}
