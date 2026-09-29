/**
 * LineStaging 暫存區相關的純決策邏輯。
 */

// 沿用專案既有的循環 require 防呆寫法（見 README 工程原則）：模組頂層只保留
// 整個模組物件的參照，實際屬性存取延後到呼叫當下才做，避免在載入順序造成
// 循環 require 時，拿到一個屬性尚未填好的半成品模組。
//
// `/mycr` 全新視角複掃：這裡直接依賴 formulaInjection.js（零依賴葉節點
// 模組），不繞經 postArticle.js——postArticle.js 會 require('./mentions')、
// mentions.js 又 require('./login')，如果將來有任何東西讓 login.js 這條鏈
// 回頭依賴到 lineStaging.js，經由 postArticle.js 取用就有循環 require 的
// 風險（auditLog.js 補同一道跳脫時就真的踩到這個坑，見 formulaInjection.js
// 開頭註解的完整說明）；直接指到零依賴的葉節點模組，從根本上不會有這個問題。
var _formulaInjectionModule = (typeof require !== 'undefined') ? require('./formulaInjection') : null;

function escapeFormulaInjectionFor_(value) {
  return (_formulaInjectionModule ? _formulaInjectionModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

/**
 * 資安複審（本輪 + `/mycr` 全新視角複掃 Finding 3）：組出要寫進 LineStaging
 * 分頁的一列資料。displayName／content 都是任何在已授權群組裡的成員可以
 * 自由決定的文字，寫入前套用跟 Articles/Replies 一致的
 * escapeFormulaInjection，避免管理員直接打開這張暫存分頁查看時，被惡意
 * 訊息觸發公式執行。webhookEventId（= event.message.id）在 M3 前提被突破
 * 的情境下同樣是攻擊者可以自由設定的字串（不像 groupId 必須精確符合白
 * 名單才會被處理到這一步），先前只補了 displayName/content 兩個「看起
 * 來像自由文字」的欄位，這輪一併補上。跳脫只發生在寫入這一刻，
 * `hasProcessedEvent`/`markRecalled` 讀回來比對用的是 Sheets 已經把跳脫
 * 前導單引號消化掉之後的原始值，不受影響，正常格式的 webhookEventId 也
 * 不會被這個跳脫函式改變輸出。messageTime 前面加的單引號是既有的「強制
 * 以文字格式儲存，不要被 Sheets 自動轉成日期/數字」處理，跟這裡的公式
 * 注入跳脫是兩件不同的事，維持原樣不動。
 * @param {string} groupId
 * @param {string} messageTime 呼叫端已經格式化好的時間字串
 * @param {string} displayName
 * @param {string} messageType
 * @param {string} content
 * @param {string} webhookEventId
 * @param {boolean} recalled
 * @returns {Array} 可以直接傳給 Sheet.appendRow 的一列資料
 */
function buildLineStagingRow(groupId, messageTime, displayName, messageType, content, webhookEventId, recalled) {
  return [
    groupId,
    "'" + messageTime,
    escapeFormulaInjectionFor_(displayName),
    messageType,
    escapeFormulaInjectionFor_(content),
    escapeFormulaInjectionFor_(webhookEventId),
    recalled
  ];
}

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
    excludeRecalled: excludeRecalled,
    buildLineStagingRow: buildLineStagingRow
  };
}
