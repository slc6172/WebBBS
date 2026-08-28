/**
 * 安全性審查 L4：把字串截斷到最多 maxLength 字，其餘原樣保留。
 * 目前唯一的呼叫端是 lineBotGlue.js 的 harvestGroupDigest_ ——
 * createArticleUnlockedFor_ 刻意不驗證長度（見它自己的註解：要避免在
 * 已持鎖的收割流程裡巢狀呼叫 createArticle 的
 * validateArticleTitle/validateArticleContent），這支函式讓 LINE 彙整
 * 出來的標題/內文，在寫入前至少被夾在跟其他發文路徑一致的長度上限內，
 * 不會無限制寫入。拆成獨立的純函式，是因為 harvestGroupDigest_ 本身混雜
 * 了大量 GAS 專屬呼叫（Utilities、Code.js 的 bumpBoardActivity_ 等），
 * 不容易直接單元測試；這支函式不碰任何 GAS API，可以直接測試。
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function truncateToLength(str, maxLength) {
  if (typeof str !== 'string' || str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    truncateToLength: truncateToLength
  };
}
