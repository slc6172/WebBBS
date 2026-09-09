/**
 * Ticket 01（未讀文章與新回覆徽章）。純函式：套用「使用者上次進入這個看板
 * 的時間」到已經讀出來的文章／回覆上，算出每篇文章要不要標「新文章」或
 * 「有新回覆」。不碰任何 Sheets/GAS API，接手的是 getBoardBulkPage 已經
 * 讀出來的資料形狀（articles + repliesByArticleId），跟 boardActivity.js
 * 的 getBoardNewContentStatus 用同一套「不做 Date 解析，直接字串比較」的
 * 前提——這個專案自己產生的時間字串（yyyy/MM/dd HH:mm:ss）字串比較就是正確
 * 的時間先後順序。
 *
 * lastSeenAt 是前端從 getBoardsFromToken 頁面載入時就拿到的值，原封不動
 * 當參數傳進來——不是機密，也不影響誰能讀到什麼內容，頂多影響徽章顯示對
 * 不對，因此這裡不需要、也不會另外查 Users 表。
 */

/**
 * @param {Array<{articleId: string, createdAt: string}>} articles
 * @param {Object<string, Array<{createdAt: string}>>} repliesByArticleId
 * @param {string} lastSeenAt - 空字串代表「從沒來過這個看板」
 * @returns {Array} articles 的淺拷貝，每個元素多了 isNew / hasNewReply 兩個布林欄位
 */
function computeArticleUnreadFlags_(articles, repliesByArticleId, lastSeenAt) {
  return articles.map(function (article) {
    var isNew = !!lastSeenAt && article.createdAt > lastSeenAt;
    var hasNewReply = false;
    if (!isNew && lastSeenAt) {
      var replies = repliesByArticleId[article.articleId] || [];
      hasNewReply = replies.some(function (reply) {
        return reply.createdAt > lastSeenAt;
      });
    }
    return Object.assign({}, article, { isNew: isNew, hasNewReply: hasNewReply });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeArticleUnreadFlags_: computeArticleUnreadFlags_
  };
}
