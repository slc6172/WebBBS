/**
 * 優化輪 ticket 08（#5）— 排行榜計算。純函式，注入 sheet 參數，讀 Users 表的
 * loginCount/articleCount/replyCount 三欄，各自算出前三名（含平手並列，可能
 * 超過 3 筆）。呼叫端（Code.js）不快取這個結果的原因見 spec：讀取來源已經是
 * 一張很小的表，不像文章列表需要整表掃描，沒有另外快取的必要。
 */

var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
}

/**
 * @param {Sheet} usersSheet
 * @returns {{loginCount: Array, articleCount: Array, replyCount: Array}}
 *   每個陣列的元素是 { userId, value }，由高到低排序。
 */
function getLeaderboard(usersSheet) {
  var lastRow = usersSheet.getLastRow();
  if (lastRow < 2) {
    return { loginCount: [], articleCount: [], replyCount: [] };
  }

  var rows = usersSheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var users = rows.map(function (r) {
    return {
      userId: r[0],
      loginCount: r[5] || 0,
      articleCount: r[7] || 0,
      replyCount: r[8] || 0
    };
  });

  return {
    loginCount: topThreeWithTies_(users, 'loginCount'),
    articleCount: topThreeWithTies_(users, 'articleCount'),
    replyCount: topThreeWithTies_(users, 'replyCount')
  };
}

/**
 * 取某個欄位由大到小排序後，前三個「不同數值」對應的所有使用者（平手並列，
 * 可能超過 3 筆）。0 分不算成就，一律排除在外——如果全部使用者在這個項目
 * 都是 0，回傳空陣列。
 * @param {{userId: string}[]} users
 * @param {string} field
 * @returns {{userId: string, value: number}[]}
 */
function topThreeWithTies_(users, field) {
  var scorers = users.filter(function (u) { return u[field] > 0; });
  var sorted = scorers.slice().sort(function (a, b) { return b[field] - a[field]; });

  var distinctValues = [];
  for (var i = 0; i < sorted.length && distinctValues.length < 3; i++) {
    if (distinctValues.indexOf(sorted[i][field]) === -1) {
      distinctValues.push(sorted[i][field]);
    }
  }

  return sorted
    .filter(function (u) { return distinctValues.indexOf(u[field]) !== -1; })
    .map(function (u) { return { userId: u.userId, value: u[field] }; });
}

/**
 * Only roles with the Permission sheet's leaderboard permission get the
 * real leaderboard; anyone else gets the same empty shape as an actually
 * empty Users sheet. No AllowRoles involved here — the leaderboard is
 * global, not scoped to any board.
 * @param {Spreadsheet} spreadsheet
 * @param {string|null} role
 * @returns {{loginCount: Array, articleCount: Array, replyCount: Array}}
 */
function getLeaderboardForRole_(spreadsheet, role) {
  if (!getRolePermissionsFor_(spreadsheet, role).leaderboard) {
    return { loginCount: [], articleCount: [], replyCount: [] };
  }
  return getLeaderboard(spreadsheet.getSheetByName('Users'));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getLeaderboard: getLeaderboard, getLeaderboardForRole_: getLeaderboardForRole_ };
}