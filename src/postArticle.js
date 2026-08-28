/**
 * Ticket 07 — posting an article.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;

// 圖片張數突破：跟 imageStorage.js 的 resolveImageSlots 共用同一個上限
// 常數，避免兩處各寫一次容易兜不起來。故意用函式在呼叫當下才讀取，不用
// 頂層 var 直接讀——GAS 把所有檔案併成同一個全域環境執行，頂層 var 的
// 賦值順序跨檔案並不保證，函式呼叫則保證發生在所有檔案的頂層程式碼都
// 執行完之後，跟現有 xFor_() 那組 wrapper 讀全域函式名稱是同一個道理。
function maxImagesPerArticleFor_() {
  return _imageStorageModule ? _imageStorageModule.MAX_IMAGES_PER_ARTICLE : MAX_IMAGES_PER_ARTICLE;
}

function validateImageCountFor_(count) {
  return (_imageStorageModule ? _imageStorageModule.validateImageCount : validateImageCount)(count);
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
 * The actual write: appends the Articles row and bumps the author's stat.
 * No validation, no locking — callers that already hold an appropriate
 * lock for their own critical section (e.g. the LINE digest harvester,
 * which must not nest a second waitLock() call inside its own locked
 * region) can call this directly instead of going through createArticle.
 * @param {Spreadsheet} spreadsheet
 * @param {{articleId: string, boardId: string, title: string, content: string, author: string, createdAt: string, imageUrls?: string[]}} input
 * @returns {{success: boolean}}
 */
function createArticleUnlocked_(spreadsheet, input) {
  var sheet = spreadsheet.getSheetByName('Articles');
  var imageUrls = input.imageUrls || [];
  // 圖片張數突破：防禦性上限，不管呼叫端有沒有先驗證過都在這裡再擋一次
  // ——這條寫入點是 LINE 彙整發文（lineBotGlue.js 的
  // createArticleUnlockedFor_）共用的路徑，那條路徑沒有互動使用者可以
  // 顯示錯誤訊息，所以這裡選擇默默截斷，不是回傳 error（一般發文路徑的
  // 拒絕邏輯在 createArticle 的 validateImageCount 檢查，見該處）。
  // 安全性審查 M1 修復延伸：title/content 早就有 escapeFormulaInjection，
  // 陣列裡的每一個 URL 一樣逐一套用，不因為改成 JSON 陣列儲存就漏掉
  // ——縱深防禦，不依賴 Code.js/resolveImageSlots_ 是唯一防線。
  var escapedImageUrls = imageUrls
    .slice(0, maxImagesPerArticleFor_())
    .map(function (u) { return escapeFormulaInjection(u); });
  sheet.appendRow([
    input.articleId,
    input.boardId,
    escapeFormulaInjection(input.title),
    input.author,
    escapeFormulaInjection(input.content),
    "'" + input.createdAt,
    '',
    '',
    0,
    JSON.stringify(escapedImageUrls)
  ]);
  incrementUserStatFor_(spreadsheet.getSheetByName('Users'), input.author, 'articleCount', 1);
  return { success: true };
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
  // 圖片張數突破：這裡是使用者互動發文的路徑，超過上限直接拒絕、讓使用者
  // 自行調整（不像 createArticleUnlocked_ 給 LINE 彙整發文那樣默默截斷）。
  var imageCountCheck = validateImageCountFor_((input.imageUrls || []).length);
  if (!imageCountCheck.valid) {
    return { success: false, error: imageCountCheck.error };
  }

  lock.waitLock(10000);
  try {
    return createArticleUnlocked_(spreadsheet, input);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Role needs the articlePost permission AND the target board's AllowRoles
 * must allow it (admin bypasses AllowRoles entirely); anyone else is
 * rejected before any validation or write happens.
 */
function createArticleForRole(spreadsheet, lock, role, input) {
  if (!getRolePermissionsFor_(spreadsheet, role).articlePost) {
    return { success: false, error: '權限不足' };
  }
  if (!boardAllowsRoleByIdFor_(spreadsheet, input.boardId, role)) {
    return { success: false, error: '權限不足' };
  }
  return createArticle(spreadsheet, lock, input);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARTICLE_TITLE_MAX_LENGTH: ARTICLE_TITLE_MAX_LENGTH,
    ARTICLE_CONTENT_MAX_LENGTH: ARTICLE_CONTENT_MAX_LENGTH,
    validateArticleTitle: validateArticleTitle,
    validateArticleContent: validateArticleContent,
    escapeFormulaInjection: escapeFormulaInjection,
    createArticle: createArticle,
    createArticleUnlocked_: createArticleUnlocked_,
    createArticleForRole: createArticleForRole
  };
}