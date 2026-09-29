/**
 * Ticket 11 — deleting your own article (cascades to its replies).
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;
var _auditLogModule = (typeof require !== 'undefined') ? require('./auditLog') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

function incrementUserStatFor_(usersSheet, userId, statName, delta) {
  return (_userStatsModule ? _userStatsModule.incrementUserStat : incrementUserStat)(usersSheet, userId, statName, delta);
}

function incrementUserStatsBatchFor_(usersSheet, statName, deltasByUserId) {
  return (_userStatsModule ? _userStatsModule.incrementUserStatsBatch_ : incrementUserStatsBatch_)(usersSheet, statName, deltasByUserId);
}

function extractFileIdFromUrlFor_(url) {
  return (_imageStorageModule ? _imageStorageModule.extractFileIdFromUrl : extractFileIdFromUrl)(url);
}

function deleteArticleImageFor_(drive, fileId) {
  return (_imageStorageModule ? _imageStorageModule.deleteArticleImage : deleteArticleImage)(drive, fileId);
}

function appendAuditLogEntryFor_(spreadsheet, nowTimestamp, actor, action, target, detail) {
  return (_auditLogModule ? _auditLogModule.appendAuditLogEntry_ : appendAuditLogEntry_)(spreadsheet, nowTimestamp, actor, action, target, detail);
}

function auditActionsFor_() {
  return _auditLogModule ? _auditLogModule.AUDIT_ACTIONS : AUDIT_ACTIONS;
}

/**
 * Finds the row number, author, and image URLs for an articleId, or null.
 * 優化輪 ticket 10：多帶出 imageUrls，刪除文章時才知道要一併清掉哪些 Drive 檔案。
 */
function findArticleRowAndAuthor_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return {
        rowNumber: i + 2,
        boardId: rows[i][1],
        author: rows[i][3],
        imageUrls: parseImageUrlsCell_(rows[i][9])
      };
    }
  }
  return null;
}

/**
 * 圖片張數突破：Articles 表的圖片欄位從 imageUrl1~3 三欄合併成單一個
 * JSON 陣列字串欄位。空值的標準表示法是 '[]'；任何無法解析的內容（理論上
 * 不該發生，防禦性處理）都當成沒有圖片，不噴錯。
 * @param {string} cellValue
 * @returns {Array<string>}
 */
function parseImageUrlsCell_(cellValue) {
  if (!cellValue) {
    return [];
  }
  try {
    var parsed = JSON.parse(cellValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Finds every row (row number + author) in a Replies-shaped sheet
 * belonging to articleId, in ascending row order.
 * 優化輪 ticket 08：多帶出 author，這篇文章連帶刪除的每則回覆，要分別扣
 * 各自作者的 replyCount（不是全部算在文章作者頭上）。
 */
function findReplyRowsAndAuthors_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A=replyId, B=articleId, C=author
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] === articleId) {
      result.push({ rowNumber: i + 2, author: rows[i][2] });
    }
  }
  return result;
}

/**
 * mycr 第 15 輪票 13（見 F-14）：把一串（已經是遞增排序的）列號分組成
 * 連續區段，供 deleteRows 批次刪除使用——例如 [4,5,6,9,10] 會分成
 * [{start:4,count:3},{start:9,count:2}]，只需要 2 次 deleteRows 呼叫，
 * 不是 5 次個別的 deleteRow。
 * @param {number[]} rowNumbers - 遞增排序
 * @returns {{start: number, count: number}[]}
 */
function groupContiguousRowNumbers_(rowNumbers) {
  var groups = [];
  var i = 0;
  while (i < rowNumbers.length) {
    var start = rowNumbers[i];
    var count = 1;
    while (i + count < rowNumbers.length && rowNumbers[i + count] === start + count) {
      count++;
    }
    groups.push({ start: start, count: count });
    i += count;
  }
  return groups;
}

/**
 * Deletes an article and every reply under it, all inside one lock.
 * Locked (unlike editArticle) because deleteRow shifts every
 * subsequent row's number — an overlapping delete elsewhere in the
 * sheet could otherwise target the wrong row once numbers move.
 * Reply rows are grouped into contiguous ranges and deleted bottom-up
 * (mycr 第 15 輪票 13) so removing one range doesn't shift the row
 * numbers of the ranges still queued for deletion.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} requestingUserId
 * @param {string} articleId
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId
 *   check (ticket 12).
 * @param {Drive} [drive] - 優化輪 ticket 10：注入的 drive 介面，用來刪除這篇
 *   文章附加的 Drive 圖片檔案。文章沒有任何圖片時完全不會用到，可以省略
 *   （沒有圖片可刪時傳 undefined 是安全的）。
 * @param {string} [nowTimestamp] - A09：只有 isAdmin 代管別人文章這種情況
 *   才會用到，寫進 AuditLog 的 timestamp 欄位；一般刪自己文章的路徑不需要。
 * @returns {{success: boolean, error?: string}}
 */
function deleteArticle(spreadsheet, lock, requestingUserId, articleId, isAdmin, drive, nowTimestamp) {
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

    // A09：只有「管理員刪的不是自己發的文章」才算數，管理員刪自己的文章
    // 跟一般使用者刪自己的文章一樣，不是需要留稽核紀錄的代管行為。
    if (isAdmin && found.author !== requestingUserId) {
      appendAuditLogEntryFor_(spreadsheet, nowTimestamp, requestingUserId, auditActionsFor_().ADMIN_DELETE_OTHERS_CONTENT, articleId, '原作者：' + found.author);
    }

    articlesSheet.deleteRow(found.rowNumber);
    incrementUserStatFor_(spreadsheet.getSheetByName('Users'), found.author, 'articleCount', -1);

    found.imageUrls.forEach(function (url) {
      var fileId = extractFileIdFromUrlFor_(url);
      if (fileId) {
        deleteArticleImageFor_(drive, fileId);
      }
    });

    var repliesSheet = spreadsheet.getSheetByName('Replies');
    var replyRows = findReplyRowsAndAuthors_(repliesSheet, articleId);

    // mycr 第 15 輪票 13：先在記憶體裡把每位回覆作者的 delta 加總好，
    // 刪除列之後只呼叫一次批次版本，不是每則回覆各自呼叫一次
    // incrementUserStatFor_（那樣每次都要重新整欄掃描一次 userId，呼叫
    // 次數隨回覆數線性成長）。
    var replyCountDeltas = {};
    replyRows.forEach(function (r) {
      replyCountDeltas[r.author] = (replyCountDeltas[r.author] || 0) - 1;
    });

    // 連續列的回覆合併成區段刪除（deleteRows），不是逐列各自呼叫一次
    // deleteRow——findReplyRowsAndAuthors_ 回傳的列號本來就是遞增排序，
    // 由高到低刪除區段，避免刪掉較低的區段之後，還沒處理到的較高區段
    // 的列號跟著位移。
    var rowNumbers = replyRows.map(function (r) { return r.rowNumber; });
    var groups = groupContiguousRowNumbers_(rowNumbers);
    for (var g = groups.length - 1; g >= 0; g--) {
      repliesSheet.deleteRows(groups[g].start, groups[g].count);
    }

    incrementUserStatsBatchFor_(spreadsheet.getSheetByName('Users'), 'replyCount', replyCountDeltas);

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * admin bypasses everything below (Permission table + AllowRoles), same
 * hardcoded special case as editArticle.js. Non-admin roles need the
 * articleManageOwn permission AND the article's own board's AllowRoles
 * to allow them. This lookup happens before the lock is acquired — it's
 * purely a permission gate, not the authoritative read (deleteArticle's
 * own lookup inside the lock is what actually decides what gets
 * deleted), so a delete racing with this check is still safe: the core
 * function's own re-read after acquiring the lock is what's trusted.
 */
function deleteArticleForRole_(spreadsheet, lock, role, requestingUserId, articleId, drive, nowTimestamp) {
  if (role !== 'admin') {
    if (!getRolePermissionsFor_(spreadsheet, role).articleManageOwn) {
      return { success: false, error: '權限不足' };
    }
    var found = findArticleRowAndAuthor_(spreadsheet.getSheetByName('Articles'), articleId);
    if (!found) {
      return { success: false, error: '文章不存在' };
    }
    if (!boardAllowsRoleByIdFor_(spreadsheet, found.boardId, role)) {
      return { success: false, error: '權限不足' };
    }
  }
  return deleteArticle(spreadsheet, lock, requestingUserId, articleId, role === 'admin', drive, nowTimestamp);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deleteArticle: deleteArticle, deleteArticleForRole_: deleteArticleForRole_ };
}