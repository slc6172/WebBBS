/**
 * LineStaging 暫存區相關的純決策邏輯。
 */

/**
 * 判斷某個 webhookEventId 是否已經有對應的暫存列，避免 LINE webhook 重送
 * 同一則仍在暫存階段的訊息事件時被記錄兩次。若原始訊息已被彙整張貼、
 * 暫存列已刪除，重送是否仍視為未處理是已知且接受的邊界情況（見 spec）。
 * @param {Array<{webhookEventId: string}>} rows
 * @param {string} webhookEventId
 * @returns {boolean}
 */
function hasProcessedEvent(rows, webhookEventId) {
  return (rows || []).some(function (row) {
    return row.webhookEventId === webhookEventId;
  });
}

/**
 * 把仍在暫存階段、對應 webhookEventId 的那一列標記為已收回，原始 content
 * 保留不刪除。找不到對應列時（訊息已被彙整張貼、暫存列已刪除）原樣回傳，
 * 不做任何修改，呼叫端不需要另外判斷是否找到。
 * @param {Array<{webhookEventId: string, recalled: boolean}>} rows
 * @param {string} webhookEventId
 * @returns {Array<Object>} 新陣列，不修改傳入的 rows
 */
function markRecalled(rows, webhookEventId) {
  return (rows || []).map(function (row) {
    if (row.webhookEventId === webhookEventId) {
      return Object.assign({}, row, { recalled: true });
    }
    return row;
  });
}

/**
 * 從暫存列中篩選出「應該被納入彙整文章」的列——已收回的訊息不納入最終
 * 文章（原本是納入、只在內容後面加註記，改成完全不納入，見對話紀錄）。
 * @param {Array<{recalled: boolean}>} rows
 * @returns {Array<Object>}
 */
function excludeRecalled(rows) {
  return (rows || []).filter(function (row) { return !row.recalled; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasProcessedEvent: hasProcessedEvent,
    markRecalled: markRecalled,
    excludeRecalled: excludeRecalled
  };
}
