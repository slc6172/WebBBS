/**
 * Ticket 10 — editing your own article.
 * Reuses validateArticleTitle/validateArticleContent/escapeFormulaInjection
 * from postArticle.js — edits follow the same rules as new posts.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions : getRolePermissions)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
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

function compactImageUrlsFor_(urls) {
  return (_imageStorageModule ? _imageStorageModule.compactImageUrls : compactImageUrls)(urls);
}

/**
 * Finds the row number, current author, and image URLs for an articleId, or null.
 * 優化輪 ticket 10：多帶出 imageUrls，編輯時才知道舊圖片是什麼，才能跟新的
 * 圖片清單比對出哪些被移除/替換掉了。
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
    // 圖片張數突破：先把可能還留著空位的陣列（前端固定格子年代的殘留
    // 語意，或編輯時某格被清空）壓成不留空缺的乾淨陣列，是最終要存進
    // Sheets 的實際內容。安全性審查 M1 修復延伸：title/content 早就有
    // escapeFormulaInjectionFor_，陣列裡每個元素一樣逐一套用——H3 修復
    // 後這些值必須等於既有連結或剛上傳的 Drive 連結，正常情況下不會以
    // =/+/-/@ 開頭，這裡是縱深防禦，不依賴 H3 的驗證是唯一防線。
    var compactedUrls = compactImageUrlsFor_(updates.imageUrls);
    var newUrls = compactedUrls.map(function (u) { return escapeFormulaInjectionFor_(u); });
    sheet.getRange(row, 10, 1, 1).setValues([[JSON.stringify(newUrls)]]); // J = imageUrls（單一 JSON 欄位）

    found.imageUrls
      .filter(function (oldUrl) { return newUrls.indexOf(oldUrl) === -1; }) // 舊圖沒出現在新清單裡 = 被移除或替換掉了
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
 * admin bypasses everything below (Permission table + AllowRoles), same
 * hardcoded special case as deleteArticle.js — this is the one deliberate
 * exception the whole permission system carries, not something meant to
 * be configurable via the Permission sheet.
 * Non-admin roles need the articleManageOwn permission AND the article's
 * own board's AllowRoles to allow them, on top of the ownership check
 * already inside editArticle. Looking up the board here means reading
 * the article row once more than editArticle's own lookup below — a
 * small duplicate read accepted for a low-frequency action, not the
 * cached high-frequency read path ticket 03 was built to protect.
 */
function editArticleForRole(spreadsheet, role, requestingUserId, articleId, updates, drive) {
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
  return editArticle(spreadsheet, requestingUserId, articleId, updates, role === 'admin', drive);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { editArticle: editArticle, editArticleForRole: editArticleForRole };
}
