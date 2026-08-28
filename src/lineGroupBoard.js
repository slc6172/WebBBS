/**
 * 判斷一個 LINE 群組是否已被管理者登記為授權群組，若是則回傳其對應的看板與群組名稱。
 * rows 對應 LineGroupBoards 工作表的每一列（管理者手動維護）。
 * @param {Array<{groupId: string, groupName: string, boardId: string}>} rows
 * @param {string} groupId
 * @returns {{authorized: boolean, boardId?: string, groupName?: string}}
 */
function resolveGroupBoard(rows, groupId) {
  var match = (rows || []).find(function (row) {
    return row.groupId === groupId;
  });

  if (!match) {
    return { authorized: false };
  }

  return { authorized: true, boardId: match.boardId, groupName: match.groupName };
}

/**
 * 算出某群組的下一篇彙整文章是當天第幾篇。lastDigestDate 已經走跟
 * createdAt/editedAt 一樣的強制純文字寫入慣例，讀回一律不含前導單引號，
 * 所以只需要單一分支比對，不需要防禦帶引號的形式。
 * @param {string} lastDigestDate - 上次彙整發文的日期（可能是空字串，代表首次）
 * @param {number} todayDigestCount - 上次彙整發文時，當天累積到第幾篇
 * @param {string} today - 這次彙整發文當下的日期
 * @returns {number}
 */
function computeNextDigestSequence(lastDigestDate, todayDigestCount, today) {
  if (lastDigestDate === today) {
    return todayDigestCount + 1;
  }
  return 1;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveGroupBoard: resolveGroupBoard,
    computeNextDigestSequence: computeNextDigestSequence
  };
}
