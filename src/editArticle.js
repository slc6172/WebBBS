/**
 * Ticket 10 — editing your own article.
 * Reuses validateArticleTitle/validateArticleContent/escapeFormulaInjection
 * from postArticle.js — edits follow the same rules as new posts.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;

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

function extractFileIdFromUrlFor_(url) {
  return (_imageStorageModule ? _imageStorageModule.extractFileIdFromUrl : extractFileIdFromUrl)(url);
}

function deleteArticleImageFor_(drive, fileId) {
  return (_imageStorageModule ? _imageStorageModule.deleteArticleImage : deleteArticleImage)(drive, fileId);
}

/**
 * Finds the row number, current author, and image URLs for an articleId, or null.
 * 優化輪 ticket 10：多帶出 imageUrl1~3，編輯時才知道舊圖片是什麼，才能跟新的
 * 圖片清單比對出哪些被移除/替換掉了。
 */
function findArticleRowAndAuthor_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return {
        rowNumber: i + 2,
        author: rows[i][3],
        imageUrls: [rows[i][9], rows[i][10], rows[i][11]].filter(function (u) { return u; })
      };
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
 * @param {{title: string, content: string, editedAt: string, imageUrls?: string[]}} updates
 *   優化輪 ticket 10：imageUrls 是「編輯後想要的最終 3 個圖片欄位」（已經上傳好的
 *   新圖連結 + 保留的舊圖連結混在一起，由 Code.js 組好傳進來）。省略這個欄位
 *   代表這次編輯完全不碰圖片，保留原樣。
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId
 *   check (ticket 12); editedBy is still requestingUserId (the admin who
 *   made the edit), not the original author.
 * @param {Drive} [drive] - 優化輪 ticket 10：注入的 drive 介面，用來刪除被替換
 *   掉或移除的舊圖片。updates.imageUrls 省略、或沒有任何圖片被移除/替換時，
 *   完全不會用到，可以省略。
 * @returns {{success: boolean, error?: string}}
 */
function editArticle(spreadsheet, requestingUserId, articleId, updates, isAdmin, drive) {
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

  if (updates.imageUrls) {
    var newUrls = [updates.imageUrls[0] || '', updates.imageUrls[1] || '', updates.imageUrls[2] || ''];
    sheet.getRange(row, 10, 1, 3).setValues([newUrls]); // J,K,L = imageUrl1~3

    var newUrlSet = newUrls.filter(function (u) { return u; });
    found.imageUrls
      .filter(function (oldUrl) { return newUrlSet.indexOf(oldUrl) === -1; }) // 舊圖沒出現在新清單裡 = 被移除或替換掉了
      .forEach(function (oldUrl) {
        var fileId = extractFileIdFromUrlFor_(oldUrl);
        if (fileId) {
          deleteArticleImageFor_(drive, fileId);
        }
      });
  }

  return { success: true };
}

/**
 * Only role=user/admin may edit at all; the ownership check inside
 * editArticle still applies on top of this.
 */
function editArticleForRole(spreadsheet, role, requestingUserId, articleId, updates, drive) {
  if (!gateByRoleFor_(role, ['user', 'admin'])) {
    return { success: false, error: '權限不足' };
  }
  return editArticle(spreadsheet, requestingUserId, articleId, updates, role === 'admin', drive);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { editArticle: editArticle, editArticleForRole: editArticleForRole };
}
