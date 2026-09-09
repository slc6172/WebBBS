/**
 * Ticket 05（@提及偵測與寫入）。
 */
var _loginModule = (typeof require !== 'undefined') ? require('./login') : null;
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;

function getUserRecordFor_(sheet, userId) {
  return (_loginModule ? _loginModule.getUserRecord_ : getUserRecord_)(sheet, userId);
}

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions : getRolePermissions)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

// 這裡本來想直接 require postArticle.js 重用它的 escapeFormulaInjection，
// 但 postArticle.js 已經 require 這個檔案（拿 recordMentionsForContent_），
// 反過來再 require 回去會形成循環 require——Node 對這種情況的行為取決於
// 兩個檔案哪一個先被載入，會讓「後載入的那個」在還沒真的 require 進來時就
// 先拿到對方一個還沒填好的 module.exports（空物件），呼叫到裡面的函式才會
// 炸開，require 當下不會報錯。這正好是 login.js 裡同一類問題的說明（見該
// 檔案 getSessionRole 附近的註解）——與其去動現有那條已經在運作的
// require 方向，這裡直接放一份小小的本地複本；escapeFormulaInjection 只有
// 5 行、純函式、邏輯穩定不太會之後跑掉，重複這一份的風險遠低於循環
// require 的風險。
var FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@'];
function escapeFormulaInjectionFor_(value) {
  if (typeof value === 'string' && value.length > 0 && FORMULA_TRIGGER_CHARS.indexOf(value.charAt(0)) !== -1) {
    return "'" + value;
  }
  return value;
}

// 跟 validateUserId（register.js）的格式規則一致：4~20 個英數字/底線。
var MENTION_PATTERN = /@([A-Za-z0-9_]{4,20})/g;

// pendingMentions 上限（bug-fix 輪）：長期不登入（離職／休眠／被鎖定測試用）的
// 帳號如果持續被 @提及，這個 JSON 陣列會一直長大，理論上可能撞到 Sheets 單一
// 儲存格 50,000 字元的上限，導致寫入失敗或內容被截斷。單筆 entry 最壞情況
// （userId 上限 20 字元、boardId 抓寬鬆 30 字元、articleId 是 36 字元的 UUID、
// articleTitle 上限 100 字元+跳脫、createdAt 時間戳 19 字元、加上 JSON key/
// 語法本身的開銷）約 285 字元；比照原始 spec 裡 content 欄位「上限 10,000 字元，
// 對照 Sheets 50,000 上限留安全餘裕」的同一種安全邊際（約 20%），50 筆
// （50 × 285 ≈ 14,250 字元，約占上限的 28%，仍有近 3.5 倍餘裕）也已經是登入
// 清單 UI 上使用者願意逐一點開看的合理上限，再多其實也沒意義。
var MAX_PENDING_MENTIONS = 50;

/**
 * 從一段文字裡擷取候選 @userId（純字串比對，不驗證是否真實存在）。
 * @param {string} text
 * @returns {string[]} 依出現順序、去重後的候選 userId 清單
 */
function extractMentionCandidates_(text) {
  if (!text) {
    return [];
  }
  var seen = {};
  var result = [];
  var match;
  MENTION_PATTERN.lastIndex = 0; // 全域 regex 帶狀態，重複呼叫前保險歸零
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    var candidate = match[1];
    if (!seen[candidate]) {
      seen[candidate] = true;
      result.push(candidate);
    }
  }
  return result;
}

/**
 * 解析目前儲存格的 pendingMentions 原始 JSON——比照 boardActivity.js 的
 * getLastSeenBoards 同一套防禦寫法：空值/非陣列/解析失敗一律當「沒有任何
 * 待通知的提及」，不拋錯。
 * @param {string|null|undefined} rawJson
 * @returns {Array}
 */
function getPendingMentions_(rawJson) {
  if (!rawJson) {
    return [];
  }
  try {
    var parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * 把一筆新的提及記錄附加進既有清單，回傳新的 JSON 字串。超過 MAX_PENDING_MENTIONS
 * 筆時，悄悄捨棄最舊的（陣列開頭）、只保留最新的 N 筆——不報錯、不通知任何人，
 * 跟這個模組其他地方「靜默略過」的慣例一致。放在這裡（而不是呼叫端
 * recordMentionsForContent_）是因為這支函式本身就有獨立的單元測試在覆蓋，
 * 裁切邏輯放這裡可以保證不管未來哪個呼叫端呼叫它都不會超過上限，也不用另外
 * 搭 spreadsheet/lock fake 才測得到邊界情況。
 * @param {string|null|undefined} rawJson - 目前儲存格的原始值
 * @param {Object} entry
 * @returns {string}
 */
function appendPendingMention_(rawJson, entry) {
  var current = getPendingMentions_(rawJson);
  current.push(entry);
  if (current.length > MAX_PENDING_MENTIONS) {
    current = current.slice(current.length - MAX_PENDING_MENTIONS);
  }
  return JSON.stringify(current);
}

/**
 * 把一次成功的提及組成單筆通知記錄的固定形狀，供 appendPendingMention_
 * 附加使用。board 名稱刻意不在這裡查——boardId 就夠，顯示成看板名稱是
 * 前端登入清單（ticket 06）用它已經有的 allBoards 資料自己轉換，這裡不用
 * 為了取名稱多讀一次 Boards 表。
 *
 * articleTitle 套用跟 postArticle.js 的 title/content/imageUrls 同一套
 * escapeFormulaInjection——縱深防禦，這裡是唯一真正的自由文字（其他欄位
 * 都是已經在別處驗證過格式的識別碼：userId、boardId、articleId），不因為
 * 存進 JSON 陣列、整個儲存格開頭固定是 [ 就假設不需要跳脫。
 * @param {{mentionedBy: string, boardId: string, articleId: string, articleTitle: string, timestamp: string}} params
 * @returns {{mentionedBy: string, boardId: string, articleId: string, articleTitle: string, createdAt: string}}
 */
function buildMentionEntry_(params) {
  return {
    mentionedBy: params.mentionedBy,
    boardId: params.boardId,
    articleId: params.articleId,
    articleTitle: escapeFormulaInjectionFor_(params.articleTitle),
    createdAt: params.timestamp
  };
}

/**
 * 整合函式：從一段內容裡找出有效的 @提及對象，逐一寫進他們各自的
 * pendingMentions 欄位。「有效」的定義：真實存在、角色對這篇文章所在的
 * 看板有讀取權限（全域 articleRead + 這個看板的 AllowRoles 都要過）、
 * 不是提及者自己。任何一項不滿足就靜默略過，不報錯、不通知任何人。
 *
 * 每個目標各自獨立取一次短鎖：existence/permission 檢查（不需要鎖，只是
 * 讀）在鎖外先做，真正要讀取-修改-寫回 pendingMentions 欄位時才上鎖，而且
 * 在鎖裡重新讀一次目前的值（不是沿用鎖外檢查時讀到的舊值）才附加寫回——
 * 避免「查完存在性到真的拿到鎖之間，剛好有別人先寫入」的更新遺失。
 *
 * 呼叫時機的重要限制：這個函式自己會呼叫 lock.waitLock()/releaseLock()，
 * 呼叫端（createArticleForRole/createReplyForRole）必須確保呼叫這個函式
 * 之前，自己原本那個保護寫入文章/回覆的鎖已經 releaseLock() 過了——GAS 的
 * script lock 不是可重入鎖，在還持有鎖的情況下巢狀再次 waitLock() 會直接
 * 卡死等到逾時，不會拋出好懂的錯誤。
 *
 * @param {Object} spreadsheet
 * @param {Object} lock
 * @param {{text: string, mentionedBy: string, boardId: string, articleId: string, articleTitle: string, timestamp: string}} params
 */
function recordMentionsForContent_(spreadsheet, lock, params) {
  var candidates = extractMentionCandidates_(params.text);
  if (candidates.length === 0) {
    return;
  }
  var usersSheet = spreadsheet.getSheetByName('Users');

  candidates.forEach(function (candidateUserId) {
    if (candidateUserId === params.mentionedBy) {
      return; // 排除自我提及
    }
    var targetUser = getUserRecordFor_(usersSheet, candidateUserId);
    if (!targetUser) {
      return; // 不存在的 userId，靜默略過
    }
    if (!getRolePermissionsFor_(spreadsheet, targetUser.role).articleRead) {
      return; // 這個角色全域就沒有讀取權限
    }
    if (!boardAllowsRoleByIdFor_(spreadsheet, params.boardId, targetUser.role)) {
      return; // 這個角色對這個看板沒有讀取權限
    }

    var entry = buildMentionEntry_({
      mentionedBy: params.mentionedBy,
      boardId: params.boardId,
      articleId: params.articleId,
      articleTitle: params.articleTitle,
      timestamp: params.timestamp
    });

    lock.waitLock(10000);
    try {
      var freshRecord = getUserRecordFor_(usersSheet, candidateUserId);
      var updated = appendPendingMention_(freshRecord ? freshRecord.pendingMentions : '', entry);
      usersSheet.getRange(freshRecord.row_, 11, 1, 1).setValues([[updated]]);
    } finally {
      lock.releaseLock();
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_PENDING_MENTIONS: MAX_PENDING_MENTIONS,
    extractMentionCandidates_: extractMentionCandidates_,
    getPendingMentions_: getPendingMentions_,
    appendPendingMention_: appendPendingMention_,
    buildMentionEntry_: buildMentionEntry_,
    recordMentionsForContent_: recordMentionsForContent_
  };
}
