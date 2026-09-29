/**
 * 公式注入跳脫——獨立成一個沒有任何其他 require 依賴的葉節點模組。
 *
 * 背景（`/mycr` 全新視角複掃，Finding 2 修復過程中發現）：這支函式原本
 * 定義在 postArticle.js 裡，`lineStaging.js`/`lineUserId.js` 都用
 * `require('./postArticle')` 取用。幫 `auditLog.js` 補上同一道跳脫時，
 * 原本也想比照辦理 `require('./postArticle')`，但這樣會造成循環
 * require：`login.js` 已經 `require('./auditLog')`（登入鎖定要寫稽核紀
 * 錄），如果 `auditLog.js` 又 `require('./postArticle')`，而
 * `postArticle.js` 會 `require('./mentions')`、`mentions.js` 又
 * `require('./login')`——整圈繞回 `login.js`，Node 對這種循環 require
 * 的處理方式是讓其中一個模組拿到「載入到一半」的半成品 exports，實際
 * 執行時就是 `getUserRecordFor_` 那類函式變成 `undefined`、噴出
 * `TypeError: ... is not a function`（單元測試有抓到，見對話紀錄）。
 *
 * 解法：把這支純函式抽到一個完全沒有依賴的獨立檔案，`postArticle.js`
 * 改成從這裡取用、原樣重新 export（既有呼叫端跟測試完全不用改），
 * `auditLog.js`／`lineStaging.js`／`lineUserId.js` 都直接依賴這個葉節
 * 點模組，不再繞經 `postArticle.js`——徹底移除這條路徑上未來再長出
 * 循環 require 的可能性，不是只治好這一次具體踩到的組合。
 */

var FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@'];

/**
 * 防止 Google Sheets 在寫入時把使用者文字誤判成公式或另一種型別
 * （數字／日期／時間／布林值）——真實試算表實測證實（見 mycr 第 15 輪
 * 票 05 對話紀錄）：不只是開頭 =+-@ 的字串會被當公式解析，長得像數字、
 * 日期、時間、布林值的一般文字，寫入時也會被自動轉換型別、讀回來就不
 * 是原始字串了。與其一一列舉「哪些字串看起來會被轉換」（日期/百分比/
 * 貨幣格式太多，列不完，未來新增的格式也列不到），一律對非空字串加上
 * 強制純文字前綴，讀取時 GAS 會自動去掉這個前綴（fakeSpreadsheet.js
 * 的 getValues() 也模擬了這個行為），呼叫端完全不需要跟著改。
 * @param {string} value
 * @returns {string}
 */
function escapeFormulaInjection(value) {
  if (typeof value === 'string' && value.length > 0) {
    return "'" + value;
  }
  return value;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FORMULA_TRIGGER_CHARS: FORMULA_TRIGGER_CHARS,
    escapeFormulaInjection: escapeFormulaInjection
  };
}
