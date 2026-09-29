/**
 * Ticket 07 — posting an article.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _userStatsModule = (typeof require !== 'undefined') ? require('./userStats') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;
var _mentionsModule = (typeof require !== 'undefined') ? require('./mentions') : null;
// `/mycr` 全新視角複掃：escapeFormulaInjection 本體移到 formulaInjection.js
// （零依賴葉節點模組，見該檔案開頭註解），避免循環 require。這裡的 wrapper
// 刻意取名 escapeFormulaInjectionFor_（不是 escapeFormulaInjection 本身）
// ——GAS 把所有檔案併成同一個全域環境執行，如果這裡也宣告一個叫
// escapeFormulaInjection 的頂層函式，會跟 formulaInjection.js 真正的那個
// 全域函式同名衝突，跟現有 xFor_() 那組 wrapper 的命名理由一致。
var _formulaInjectionModule = (typeof require !== 'undefined') ? require('./formulaInjection') : null;

function escapeFormulaInjectionFor_(value) {
  return (_formulaInjectionModule ? _formulaInjectionModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

function recordMentionsForContentFor_(spreadsheet, lock, params) {
  return (_mentionsModule ? _mentionsModule.recordMentionsForContent_ : recordMentionsForContent_)(spreadsheet, lock, params);
}

function validateMentionCountFor_(text) {
  return (_mentionsModule ? _mentionsModule.validateMentionCount_ : validateMentionCount_)(text);
}

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
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
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
  //
  // mycr 第 15 輪票 05：這裡原本對陣列裡每個 URL 逐一套用
  // escapeFormulaInjectionFor_（「縱深防禦」），但 imageUrls 是先組成
  // 陣列、整包 JSON.stringify 之後才寫進 Articles 表第 10 欄「一整格」，
  // 不是每個 URL 各自佔一格。Sheets 的公式/型別誤判只發生在整格層級，
  // 這一整格永遠是 `[` 開頭的 JSON 陣列字串，不可能被誤判——對陣列元素
  // 逐一跳脫從來沒有真的防到任何風險。escapeFormulaInjection 現在改成
  // 「非空字串一律加前綴」後，繼續套用會讓每一個圖片連結在
  // parseImageUrlsCell_ 讀回來時都多一個游離的撇號（`parseImageUrlsCell_`
  // 只是單純 JSON.parse，不會像 Sheets 對整格開頭撇號那樣自動去除），
  // 等於讓每一篇文章的每一張圖片都直接打不開——不是可接受的邊界代價，
  // 是會實際壞掉的功能，所以拿掉這裡的跳脫。
  var escapedImageUrls = imageUrls.slice(0, maxImagesPerArticleFor_());
  sheet.appendRow([
    input.articleId,
    input.boardId,
    escapeFormulaInjectionFor_(input.title),
    input.author,
    escapeFormulaInjectionFor_(input.content),
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
  // API4（換角度複查輪，對照 OWASP API Security Top 10 2023）：跟標題/
  // 內容驗證同一個位置、同一種「拒絕整篇貼文,讓使用者自行調整」處理
  // 方式——見 mentions.js 的 validateMentionCount_ 開頭註解說明為什麼
  // 這裡選擇拒絕而不是靜默截斷。驗證的字串刻意跟下面
  // recordMentionsForContentFor_ 實際掃描的字串完全一致（title+content
  // 合併),不能只驗 content——標題雖然短(上限100字),但也算在同一次
  // 掃描範圍內，只驗 content 會漏算標題裡的 @提及。
  var mentionCountCheck = validateMentionCountFor_(input.title + '\n' + input.content);
  if (!mentionCountCheck.valid) {
    return { success: false, error: mentionCountCheck.error };
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
/**
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} role
 * @param {{articleId: string, boardId: string, title: string, content: string, author: string, createdAt: string}} input
 * @returns {{success: boolean, error?: string}}
 */
function createArticleForRole_(spreadsheet, lock, role, input) {
  if (!getRolePermissionsFor_(spreadsheet, role).articlePost) {
    return { success: false, error: '權限不足' };
  }
  if (!boardAllowsRoleByIdFor_(spreadsheet, input.boardId, role)) {
    return { success: false, error: '權限不足' };
  }
  var result = createArticle(spreadsheet, lock, input);
  // @提及輪 ticket 05：createArticle 內部的 lock.waitLock()/releaseLock() 這
  // 時候已經跑完、鎖已經釋放了（不是還握著），這裡才呼叫
  // recordMentionsForContentFor_（它會自己再取一次同一個 lock）才不會巢狀
  // 鎖死——GAS 的 script lock 不是可重入鎖，同一次執行裡鎖還沒放掉又再要
  // 一次會直接卡到逾時。
  if (result.success) {
    recordMentionsForContentFor_(spreadsheet, lock, {
      text: input.title + '\n' + input.content,
      mentionedBy: input.author,
      boardId: input.boardId,
      articleId: input.articleId,
      articleTitle: input.title,
      timestamp: input.createdAt
    });
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARTICLE_TITLE_MAX_LENGTH: ARTICLE_TITLE_MAX_LENGTH,
    ARTICLE_CONTENT_MAX_LENGTH: ARTICLE_CONTENT_MAX_LENGTH,
    validateArticleTitle: validateArticleTitle,
    validateArticleContent: validateArticleContent,
    escapeFormulaInjection: escapeFormulaInjectionFor_,
    createArticle: createArticle,
    createArticleUnlocked_: createArticleUnlocked_,
    createArticleForRole_: createArticleForRole_
  };
}