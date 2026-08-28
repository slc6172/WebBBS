// 圖片張數突破輪 ticket 05：從 3 放寬到 99，跟一般發文的圖片張數上限
// （imageStorage.js 的 MAX_IMAGES_PER_ARTICLE）用同一個數字，理由是：
// 圖片張數突破前，這個門檻本來就是為了配合舊版「文章最多 3 張圖」的
// 限制而設的，避免群組討論還沒告一段落就被迫因為湊到 3 張圖而提前發文；
// 現在文章不再有這個 3 張的限制，這個門檻自然也該放寬到跟文章本身一致。
var LINE_DIGEST_IMAGE_THRESHOLD = 99;
var LINE_DIGEST_CONTENT_LENGTH_THRESHOLD = 8000;

/**
 * 判斷某群組目前暫存的內容是否達到分段收割門檻：圖片數 ≥3 或文字量 ≥8000
 * 字元，任一即可觸發，兩者以「群組」為單位各自獨立計算（由呼叫端負責只
 * 傳入單一群組的暫存內容彙總）。
 * @param {{imageCount: number, contentLength: number}} state
 * @returns {boolean}
 */
function shouldHarvest(state) {
  return state.imageCount >= LINE_DIGEST_IMAGE_THRESHOLD || state.contentLength >= LINE_DIGEST_CONTENT_LENGTH_THRESHOLD;
}

/**
 * 判斷某群組是否還有殘餘暫存內容（沒有到達一般收割門檻，但換日檢查時
 * 仍應被收割送出，避免內容一直卡在暫存區）。
 * @param {{imageCount: number, contentLength: number}} state
 * @returns {boolean}
 */
function hasResidualContent(state) {
  return state.imageCount > 0 || state.contentLength > 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LINE_DIGEST_IMAGE_THRESHOLD: LINE_DIGEST_IMAGE_THRESHOLD,
    LINE_DIGEST_CONTENT_LENGTH_THRESHOLD: LINE_DIGEST_CONTENT_LENGTH_THRESHOLD,
    shouldHarvest: shouldHarvest,
    hasResidualContent: hasResidualContent
  };
}
