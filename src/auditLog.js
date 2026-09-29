/**
 * A09（安全性複查換角度輪，對照 OWASP Top 10 2021）——輕量稽核紀錄。
 *
 * 刻意不是「每個請求都寫一筆」的完整存取 log，只在下列本來就稀少的高
 * 價值事件發生時 append 一列到 AuditLog 分頁：登入鎖定被觸發、管理員
 * 重設密碼、管理員代管（刪除/編輯）不是自己發的文章或回覆。一天下來
 * 多出的寫入次數是個位數等級，不違反本專案既有的「試算表讀寫次數精
 * 簡」原則（那個原則針對的是每次頁面載入/看板瀏覽這種高頻路徑，不是
 * 這種稀少的管理行為）。完整設計與取捨記錄在
 * gas-bbs-owasp-checklist-and-fresh-eyes-findings-spec.md 的 Finding A09。
 *
 * `/mycr` 全新視角複掃 Finding 2（對照 OWASP Top 10:2025 A09 的
 * CWE-117 Improper Output Neutralization for Logs）：`LOGIN_LOCKOUT`
 * 這個事件的 actor/target 是「觸發鎖定的登入嘗試 userId」——這個字串
 * 完全沒有經過任何格式驗證（不像註冊會檢查 USER_ID_PATTERN），任何人
 * 不需要登入就能用一個刻意構造的字串連續打錯密碼 5 次來觸發。跟
 * `lineStaging.js`/`lineUserId.js` 同一個理由，寫入前套用
 * `escapeFormulaInjection`，避免管理員在收到鎖定通知後打開這張表查看
 * 時被觸發公式執行。
 *
 * 這裡直接依賴 `formulaInjection.js`（零依賴葉節點模組），刻意不繞經
 * `postArticle.js`——`login.js` 已經 `require('./auditLog')`，如果這裡
 * 又 `require('./postArticle')`，而 `postArticle.js` 會
 * `require('./mentions')`、`mentions.js` 又 `require('./login')`，會
 * 整圈繞回 `login.js` 造成循環 require（實作過程中真的踩到這個坑，單
 * 元測試有抓到，見對話紀錄）。詳細成因見 `formulaInjection.js` 開頭
 * 註解。
 */
var _formulaInjectionModuleForAudit_ = (typeof require !== 'undefined') ? require('./formulaInjection') : null;

function escapeFormulaInjectionForAudit_(value) {
  return (_formulaInjectionModuleForAudit_ ? _formulaInjectionModuleForAudit_.escapeFormulaInjection : escapeFormulaInjection)(value);
}

var AUDIT_ACTIONS = {
  LOGIN_LOCKOUT: 'LOGIN_LOCKOUT',
  ADMIN_RESET_PASSWORD: 'ADMIN_RESET_PASSWORD',
  ADMIN_DELETE_OTHERS_CONTENT: 'ADMIN_DELETE_OTHERS_CONTENT',
  ADMIN_EDIT_OTHERS_CONTENT: 'ADMIN_EDIT_OTHERS_CONTENT'
};

/**
 * 純函式：組出要 appendRow 的那一列。跟寫入動作本身分開，方便不用假
 * 試算表就能單元測試。timestamp 前面加一個單引號強制存成純文字——跟
 * 這個專案其他所有時間戳記欄位的既有寫法一致（見 schema.js 開頭註解），
 * 不依賴 TIMESTAMP_COLUMNS 的欄位格式鎖定是唯一防線。actor/target/detail
 * 三者都套用 escapeFormulaInjection——見上方檔案註解的 Finding 2 說明，
 * `action` 不用跳脫，因為它只可能是 AUDIT_ACTIONS 裡的固定字串之一。
 * @param {string} nowTimestamp
 * @param {string} actor - 執行動作的 userId；登入鎖定這種還沒驗證身份
 *   成功過的情境，就是觸發鎖定的那個 userId 本身（不代表這個帳號真的
 *   是本人在操作，只是「哪個帳號被鎖住了」這個事實本身值得記錄）。
 * @param {string} action - 建議從 AUDIT_ACTIONS 裡取值，避免打錯字。
 * @param {string} [target] - 受影響的 userId 或 articleId/replyId。
 * @param {string} [detail] - 自由文字，視事件類型放額外脈絡。
 * @returns {Array} 準備好可以直接丟給 appendRow 的一列。
 */
function buildAuditLogRow_(nowTimestamp, actor, action, target, detail) {
  return [
    "'" + (nowTimestamp || ''),
    escapeFormulaInjectionForAudit_(actor || ''),
    action || '',
    escapeFormulaInjectionForAudit_(target || ''),
    escapeFormulaInjectionForAudit_(detail || '')
  ];
}

/**
 * 把一筆稽核紀錄寫進 AuditLog 分頁。刻意用 try/catch 包住整個寫入動
 * 作，絕不讓稽核紀錄本身的失敗（例如分頁還沒被 ensureSchema 建出來、
 * 或任何其他寫入層級的例外）反過來讓它附掛的主要操作回報失敗——跟
 * mentions.js 既有的「次要關注點不能讓主流程中斷」慣例完全一樣的理
 * 由。漏記一筆稽核紀錄，好過讓一次真的成功的密碼重設/管理員代管動
 * 作，反而回報失敗給呼叫端。
 * @param {Spreadsheet} spreadsheet
 * @param {string} nowTimestamp
 * @param {string} actor
 * @param {string} action
 * @param {string} [target]
 * @param {string} [detail]
 */
function appendAuditLogEntry_(spreadsheet, nowTimestamp, actor, action, target, detail) {
  try {
    var sheet = spreadsheet.getSheetByName('AuditLog');
    if (!sheet) {
      return;
    }
    sheet.appendRow(buildAuditLogRow_(nowTimestamp, actor, action, target, detail));
  } catch (e) {
    // 見上面的函式註解：刻意吞掉，不重新拋出。
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AUDIT_ACTIONS: AUDIT_ACTIONS,
    buildAuditLogRow_: buildAuditLogRow_,
    appendAuditLogEntry_: appendAuditLogEntry_
  };
}
