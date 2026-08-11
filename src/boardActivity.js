/**
 * 看板列表「新文章/新回覆」提示功能。
 *
 * 使用者的「上次進入各看板的時間」存在 Users 表的 lastSeenBoards 欄位，
 * 格式是 JSON 字串（{"boardId": "yyyy/MM/dd HH:mm:ss", ...}），跟其他欄位
 * 存純日期字串不同——這欄本身不是時間戳記，不用套用「寫入時加單引號」那招
 * （schema.js 的 TIMESTAMP_COLUMNS 也刻意沒有把這欄列進去）。
 *
 * 看板的「最新文章時間」「最新回覆時間」存在 Boards 表新增的兩欄，由
 * Code.js 在發文/編輯文章/回覆成功時更新（只往前推進，刪除不會讓它往回
 * 復原——見對話紀錄的取捨說明）。
 */

/**
 * 把 Users 表 lastSeenBoards 欄位讀出來的原始字串解析成物件。空白/null/
 * undefined，或格式損毀解析不出來，一律當作「從沒看過任何看板」回傳空物件，
 * 不丟例外。
 * @param {string|null|undefined} rawJson
 * @returns {Object<string, string>}
 */
function getLastSeenBoards(rawJson) {
  if (!rawJson) {
    return {};
  }
  try {
    var parsed = JSON.parse(rawJson);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * 把某個看板的「上次進入時間」更新成 timestamp，其他看板的記錄原樣保留。
 * @param {string|null|undefined} rawJson - 目前儲存格的原始值
 * @param {string} boardId
 * @param {string} timestamp
 * @returns {string} 要寫回儲存格的新 JSON 字串
 */
function updateLastSeenBoard(rawJson, boardId, timestamp) {
  var current = getLastSeenBoards(rawJson);
  current[boardId] = timestamp;
  return JSON.stringify(current);
}

/**
 * 依照使用者的「上次進入各看板時間」跟每個看板的「最新文章/回覆時間」，
 * 算出每個看板要不要顯示新內容提示。看板不在 lastSeenBoards 裡（從沒進去
 * 過）視為「最舊」，只要看板曾經有過文章/回覆就一定顯示提示；等使用者
 * 進去看過一次、記錄下時間之後，提示才會依照真正的時間比較消失。
 *
 * 時間字串都是本專案自己產生的標準格式（yyyy/MM/dd HH:mm:ss），直接用
 * 字串比較就是正確的時間先後順序，不需要額外解析成 Date。
 *
 * @param {Object<string, string>} lastSeenBoards - getLastSeenBoards() 的結果
 * @param {{boardId: string, latestArticleAt: string, latestReplyAt: string}[]} boards
 * @returns {Object<string, {hasNewArticle: boolean, hasNewReply: boolean}>}
 */
function getBoardNewContentStatus(lastSeenBoards, boards) {
  var result = {};
  boards.forEach(function (board) {
    var lastSeen = lastSeenBoards[board.boardId] || '';
    result[board.boardId] = {
      hasNewArticle: !!board.latestArticleAt && board.latestArticleAt > lastSeen,
      hasNewReply: !!board.latestReplyAt && board.latestReplyAt > lastSeen
    };
  });
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getLastSeenBoards: getLastSeenBoards,
    updateLastSeenBoard: updateLastSeenBoard,
    getBoardNewContentStatus: getBoardNewContentStatus
  };
}
