/**
 * 一次性資料修正工具（外部匯入文章的時間格式修正）用的純函式。
 *
 * 匯入的文章時間長得像 "1996-03-05 3:01:50"（用 - 分隔、時分秒沒補零），跟
 * 本專案自己產生的 "yyyy/MM/dd HH:mm:ss"（用 / 分隔、時分秒都補零）格式不同。
 * 因為 listArticlesByBoard 的排序是直接做字串比較，格式不一致會導致排序出錯——
 * 最明確的例子：同一天裡，"4:47:08"（凌晨4點多）跟 "18:16:10"（下午6點多）
 * 做字串比較時，因為 "4" > "1"，"4:47:08" 會被誤判成比較晚，跟實際時間相反。
 *
 * 刻意不用 Utilities.formatDate（GAS 專屬）——這裡只是把「同一個壁鐘時間字串」
 * 重新排版成統一格式，不是要做真的時區轉換，直接用 Date 的 local getter 組
 * 字串就好，這樣在 Node 測試環境也能正常運作，不用管執行環境的時區設定。
 */

var CANONICAL_FORMAT_REGEX = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * 判斷一個值是不是已經是正確格式（字串、yyyy/MM/dd HH:mm:ss、斜線分隔、
 * 時分秒都補零）。
 * @param {*} value
 * @returns {boolean}
 */
function isCanonicalTimestamp(value) {
  return typeof value === 'string' && CANONICAL_FORMAT_REGEX.test(value);
}

/**
 * 嘗試把「鬆散格式」的時間字串（年月日用 - 或 / 分隔，時分秒不一定有補零，
 * 例如 "1996-3-5 3:1:50"）解析成一個代表同一個壁鐘時間的 Date 物件。輸入
 * 本來就是（有效的）Date 物件時原樣接受；解析不出來（格式不符、或月/日/時/
 * 分/秒超出合理範圍導致 JS Date 自動進位吸收掉）回傳 null，不猜測、不硬湊。
 * @param {string|Date} raw
 * @returns {Date|null}
 */
function parseLooseTimestamp(raw) {
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  var match = raw.trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return null;
  }

  var year = parseInt(match[1], 10);
  var month = parseInt(match[2], 10) - 1; // JS Date 月份從 0 開始
  var day = parseInt(match[3], 10);
  var hour = parseInt(match[4], 10);
  var minute = parseInt(match[5], 10);
  var second = parseInt(match[6], 10);

  var date = new Date(year, month, day, hour, minute, second);
  // new Date() 對超出範圍的輸入（例如 2 月 30 日）會自動進位成 3 月初而不報錯，
  // 這裡檢查解析回去的欄位是否跟輸入完全一致，不一致就代表輸入本來就不合理
  if (
    date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) {
    return null;
  }
  return date;
}

/**
 * 把一個 Date 物件格式化成本專案的標準時間字串格式：yyyy/MM/dd HH:mm:ss，
 * 時分秒都補零。
 * @param {Date} date
 * @returns {string}
 */
function formatCanonicalTimestamp(date) {
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  return date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isCanonicalTimestamp: isCanonicalTimestamp,
    parseLooseTimestamp: parseLooseTimestamp,
    formatCanonicalTimestamp: formatCanonicalTimestamp,
    CANONICAL_FORMAT_REGEX: CANONICAL_FORMAT_REGEX
  };
}
