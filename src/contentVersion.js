/**
 * 優化輪 ticket 03（#1a）— 看板文章列表的版本戳。
 *
 * 存在 CacheService 裡，不寫入 Sheets schema。版本值本身只是「有沒有變過」的
 * 信號，內容是什麼格式不重要（呼叫端目前用 Utilities.getUuid()），這裡只單純
 * 負責讀寫，比對邏輯留給呼叫端（Code.js）。
 *
 * 刻意不注入時鐘 —— 版本值由呼叫端（GAS 環境才有真實時鐘/UUID）產生好、當參數
 * 傳進來，這兩個函式維持單純的 cache 讀寫，好測試。
 *
 * 快取過期或從未寫過時 getBoardVersion 回傳 null；呼叫端看到 null 一律當作
 * 「不確定，需要重新完整讀取」，這是刻意的保守選擇（見 spec）。
 */

var BOARD_VERSION_PREFIX = 'boardVersion_';
var ARTICLE_VERSION_PREFIX = 'articleVersion_';
var VERSION_TTL_SECONDS = 21600; // 6 小時，與 session token TTL 一致

/**
 * @param {Cache} cache - e.g. CacheService.getScriptCache()
 * @param {string} boardId
 * @returns {string|null}
 */
function getBoardVersion(cache, boardId) {
  return cache.get(BOARD_VERSION_PREFIX + boardId) || null;
}

/**
 * @param {Cache} cache
 * @param {string} boardId
 * @param {string} versionValue - 呼叫端產生的新版本值
 */
function bumpBoardVersion(cache, boardId, versionValue) {
  cache.put(BOARD_VERSION_PREFIX + boardId, versionValue, VERSION_TTL_SECONDS);
}

/**
 * 優化輪 ticket 04（#1b）— 文章詳情/回覆列表用的版本戳，行為與看板版本完全對稱，
 * 只是 key 前綴不同（跟看板版本各自獨立的 keyspace，就算 boardId 跟 articleId
 * 字串剛好一樣也不會互相蓋掉）。
 * @param {Cache} cache
 * @param {string} articleId
 * @returns {string|null}
 */
function getArticleVersion(cache, articleId) {
  return cache.get(ARTICLE_VERSION_PREFIX + articleId) || null;
}

/**
 * @param {Cache} cache
 * @param {string} articleId
 * @param {string} versionValue
 */
function bumpArticleVersion(cache, articleId, versionValue) {
  cache.put(ARTICLE_VERSION_PREFIX + articleId, versionValue, VERSION_TTL_SECONDS);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBoardVersion: getBoardVersion,
    bumpBoardVersion: bumpBoardVersion,
    getArticleVersion: getArticleVersion,
    bumpArticleVersion: bumpArticleVersion,
    BOARD_VERSION_PREFIX: BOARD_VERSION_PREFIX,
    ARTICLE_VERSION_PREFIX: ARTICLE_VERSION_PREFIX
  };
}
