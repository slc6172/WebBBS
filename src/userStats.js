/**
 * 優化輪 ticket 08（#5）— 讀寫 Users 表裡的統計欄位（articleCount/replyCount），
 * 供發文/回覆/刪文/刪回覆這幾個已經在鎖定區間內的操作，順手 +1/-1 使用，不用
 * 額外再取一次鎖。
 */

var USER_STATS_COLUMNS = {
  articleCount: 8,
  replyCount: 9
};

/**
 * 在 Users 表裡找到 userId 對應的列，把 delta（可正可負）加到指定的統計欄位。
 * 找不到該使用者時安靜地什麼都不做——理論上不該發生（能發文/回覆代表這個
 * userId 一定存在），但寧可保守，不要因為統計欄位找不到就讓整個發文/回覆
 * 操作失敗。
 * @param {Sheet} usersSheet
 * @param {string} userId
 * @param {'articleCount'|'replyCount'} statName
 * @param {number} delta
 */
function incrementUserStat(usersSheet, userId, statName, delta) {
  var col = USER_STATS_COLUMNS[statName];
  var lastRow = usersSheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  var ids = usersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === userId) {
      var row = i + 2;
      var cell = usersSheet.getRange(row, col, 1, 1);
      var current = cell.getValues()[0][0] || 0;
      cell.setValues([[current + delta]]);
      return;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    incrementUserStat: incrementUserStat,
    USER_STATS_COLUMNS: USER_STATS_COLUMNS
  };
}
