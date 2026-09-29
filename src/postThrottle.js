/**
 * API6（換角度複查輪，對照 OWASP API Security Top 10 2023——Unrestricted
 * Access to Sensitive Business Flows）——發文/回覆本身完全沒有節流，
 * 一個已登入帳號（或被盜用的帳號、或簡單腳本）可以無限速發文/回覆洗版。
 *
 * 跟 register.js 的 checkAndConsumeRegistrationQuota_ 刻意做成不同的機制：
 * 註冊沒有身份可以綁定（GAS 拿不到來源 IP，見既有的「註冊節流結構性
 * 限制」記錄），只能做成全站共用；但發文/回覆是已登入的，有真實的
 * requestingUserId 可以綁，綁在每個使用者自己身上——一個人洗版只會擋到
 * 他自己，不會變成新的「共用狀態本身就是攻擊面」問題（第十輪交接文件
 * 教訓 3 提過的同一類坑，這裡從設計上就避開）。
 *
 * 文章跟回覆共用同一個計數器（同一個 userId 底下，洗版就是洗版，不分是
 * 發文還是回覆）。用的是 CacheService，不是 SpreadsheetApp——README 那條
 * 「少讀寫試算表」的方針明講只針對 SpreadsheetApp 的呼叫次數，
 * CacheService 是完全不同的服務，跟既有的註冊節流一樣不算在那條方針要
 * 控制的範圍內。
 */

var POST_LIMIT_PER_WINDOW = 10; // 起點數字，之後可依實際使用情況調整
var POST_WINDOW_SECONDS = 60;
var POST_THROTTLE_PREFIX = 'postThrottle_';

/**
 * @param {Cache} cache
 * @param {string} userId
 * @returns {{allowed: boolean}}
 */
function checkAndConsumePostQuota_(cache, userId) {
  var key = POST_THROTTLE_PREFIX + userId;
  var count = parseInt(cache.get(key), 10) || 0;

  if (count >= POST_LIMIT_PER_WINDOW) {
    return { allowed: false };
  }

  cache.put(key, String(count + 1), POST_WINDOW_SECONDS);
  return { allowed: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    POST_LIMIT_PER_WINDOW: POST_LIMIT_PER_WINDOW,
    POST_WINDOW_SECONDS: POST_WINDOW_SECONDS,
    checkAndConsumePostQuota_: checkAndConsumePostQuota_
  };
}
