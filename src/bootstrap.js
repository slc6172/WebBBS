// 安全性審查 H1 修復:board/articleId 白名單。這兩個值最終會被
// doGet() 透過 JSON.stringify 塞進 Index.html 的 <script> 區塊(見
// bootstrapDataJson)。JSON.stringify 不會跳脫 </script>,只驗證/跳脫
// HTML 屬性或文字節點是不夠的 —— 任何不符合這個白名單的字元一律視為
// 沒帶這個參數處理,不嘗試「跳脫後照樣塞進去」。
// boardId 是管理者手動命名的 slug(允許連字號,例如 secret-board);
// articleId 是 Utilities.getUuid() 產生的 UUID,但這裡刻意不綁死
// UUID 的精確格式(佔比字元、破折號位置),只要求「看起來像合法 ID
// 會用到的字元集合」,這樣未來 ID 產生方式微調也不會讓深連結整個失效。
var BOOTSTRAP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Parses the query-string parameters GAS hands to doGet(e) into the
 * bootstrap data the frontend template needs to decide whether to jump
 * straight into a shared board/article (deep link support, ticket 13).
 * Pure function — no GAS APIs involved, so it needs no mocking.
 * Any value that doesn't match BOOTSTRAP_ID_PATTERN is dropped rather than
 * passed through. 安全性審查 H1 修復後更新：Index.html 現在把這個結果放進
 * 會自動 HTML 跳脫的 data-* 屬性(不再是不跳脫地直接塞進 <script> 區塊),
 * 所以嚴格來說即使沒有這道白名單,H1 描述的 </script> 提前關閉攻擊也已經
 * 被那邊的樣板改法擋下來了——這裡的白名單是縱深防禦,不是唯一防線,兩邊
 * 都做,不要互相依賴對方是唯一防線這件事本身。
 * @param {Object} e - the event object passed to doGet(e); may be undefined
 * @returns {{boardId?: string, articleId?: string}}
 */
function parseBootstrapParams(e) {
  var params = (e && e.parameter) || {};
  var result = {};
  if (params.board && BOOTSTRAP_ID_PATTERN.test(String(params.board))) {
    result.boardId = String(params.board);
  }
  if (params.article && BOOTSTRAP_ID_PATTERN.test(String(params.article))) {
    result.articleId = String(params.article);
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseBootstrapParams: parseBootstrapParams };
}