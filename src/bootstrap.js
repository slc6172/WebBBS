// 安全性審查 H1 修復:board/articleId 白名單。這兩個值最終會被
// doGet() 透過 Code.js 的 toSafeScriptJson_（JSON.stringify 之後，額外
// 手動跳脫 < > & 三個字元）塞進 Index.html 的 <script> 區塊(見
// bootstrapDataJson)。單靠 JSON.stringify 不會跳脫 </script>,這裡的白名單
// 是在 toSafeScriptJson_ 的手動跳脫之外，再加一層縱深防禦 —— 任何不符合
// 這個白名單的字元一律視為沒帶這個參數處理,不嘗試「跳脫後照樣塞進去」。
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
 * passed through. 安全性審查 H1 修復後更新（複審 Finding 4 修正：這段註解
 * 原本寫「Index.html 現在把這個結果放進會自動 HTML 跳脫的 data-* 屬性」，
 * 但後來因為 GAS 樣板引擎對自訂 data-* 屬性的 contextual autoescaper 不可靠，
 * 已經改回「印成 <script> 裡的變數宣告 + Code.js 的 toSafeScriptJson_ 手動
 * 跳脫」——這裡原本的說法沒有跟著更新，容易誤導後續維護者以為目前防線是
 * data-* 屬性跳脫，見對話紀錄）：現況是 doGet() 透過 toSafeScriptJson_
 * （手動跳脫 < > &）把這裡回傳的結果印成 Index.html 的 <script> 區塊裡一行
 * 變數宣告（bootstrapDataJson，不經過任何 HTML 屬性），所以嚴格來說即使
 * 沒有這道白名單，H1 描述的 </script> 提前關閉攻擊也已經被 toSafeScriptJson_
 * 的手動跳脫擋下來了——這裡的白名單是縱深防禦，不是唯一防線，兩邊都做，
 * 不要互相依賴對方是唯一防線這件事本身。
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