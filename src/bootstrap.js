/**
 * Parses the query-string parameters GAS hands to doGet(e) into the
 * bootstrap data the frontend template needs to decide whether to jump
 * straight into a shared board/article (deep link support, ticket 13).
 * Pure function — no GAS APIs involved, so it needs no mocking.
 * @param {Object} e - the event object passed to doGet(e); may be undefined
 * @returns {{boardId?: string, articleId?: string}}
 */
function parseBootstrapParams(e) {
  var params = (e && e.parameter) || {};
  var result = {};
  if (params.board) {
    result.boardId = String(params.board);
  }
  if (params.article) {
    result.articleId = String(params.article);
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseBootstrapParams: parseBootstrapParams };
}