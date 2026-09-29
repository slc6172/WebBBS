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

/**
 * mycr 第 15 輪票 13（見 F-14）：批次版本——一次套用「多個 userId 各自
 * 的 delta」，固定只做「讀 userId 整欄一次、讀統計欄整欄一次、寫回統計
 * 欄整欄一次」共 3 次 SpreadsheetApp 呼叫（外加 1 次 getLastRow），不管
 * deltasByUserId 裡有幾個 userId、每個 userId 各自要處理幾筆——供
 * deleteArticle 刪除大量回覆時使用，取代逐筆呼叫 incrementUserStat（那樣
 * 每筆都要重新整欄掃描一次 userId，呼叫次數隨筆數線性成長）。
 * @param {Sheet} usersSheet
 * @param {'articleCount'|'replyCount'} statName
 * @param {Object<string, number>} deltasByUserId - userId 對應要套用的
 *   delta（可正可負）；同一個 userId 在呼叫端應該已經把多筆加總成一個
 *   數字，這支函式本身不做加總。
 */
function incrementUserStatsBatch_(usersSheet, statName, deltasByUserId) {
  if (Object.keys(deltasByUserId).length === 0) {
    return; // 沒有任何東西要改，連讀都不用讀
  }
  var col = USER_STATS_COLUMNS[statName];
  var lastRow = usersSheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  var idRange = usersSheet.getRange(2, 1, lastRow - 1, 1);
  var ids = idRange.getValues();
  var statRange = usersSheet.getRange(2, col, lastRow - 1, 1);
  var stats = statRange.getValues();
  var changed = false;
  for (var i = 0; i < ids.length; i++) {
    var uid = ids[i][0];
    if (Object.prototype.hasOwnProperty.call(deltasByUserId, uid)) {
      stats[i][0] = (stats[i][0] || 0) + deltasByUserId[uid];
      changed = true;
    }
  }
  if (changed) {
    statRange.setValues(stats);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    incrementUserStat: incrementUserStat,
    incrementUserStatsBatch_: incrementUserStatsBatch_,
    USER_STATS_COLUMNS: USER_STATS_COLUMNS
  };
}
