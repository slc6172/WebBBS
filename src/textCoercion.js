/**
 * mycr 第 15 輪票 05（見 F-15）：讀取端的防禦性字串化——修法前既有的
 * 列（title/content 等欄位如果剛好長得像數字、日期、時間、布林值）可能
 * 已經被 Google Sheets 自動轉成 Number/Date/Boolean，寫端這輪的修法
 * （formulaInjection.js 改成一律加前綴）只防得住「之後新寫入」的資料，
 * 防不了「已經寫進去的舊資料」。這支函式讓讀取路徑對這類舊資料保持
 * 寬容：轉成字串而不是讓前端的字串方法（例如 .toLowerCase() 做搜尋
 * 比對）在讀到一個 Date/Number/Boolean 值時直接拋出例外。
 *
 * 獨立成零依賴的葉節點模組（跟 formulaInjection.js/timestampNormalizer.js
 * 同一種做法），因為 articles.js/boardBulk.js/articleDetail.js 都要用，
 * 三個檔案之間互相沒有既定的 require 方向可以借用。
 */

/**
 * @param {*} value
 * @returns {string}
 */
function toSafeDisplayString_(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toSafeDisplayString_: toSafeDisplayString_ };
}
