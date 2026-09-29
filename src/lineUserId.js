/**
 * 未驗證的 LINE Official Account 打不了「取得群組成員檔案」API（該 API 只
 * 開放給已驗證／Premium 帳號，見對話紀錄），所以拿不到暱稱，只能拿到
 * userId（`U` 開頭的一串亂碼）。這個模組讓管理者能自己手動維護一份
 * userId → 顯示名稱的對應表（LineUserId 工作表），彙整發文時查表替換：
 *   - 查得到：用管理者填的 DisplayId 當顯示名稱
 *   - 查不到：先用 userId 本身當顯示名稱，同時回傳一筆要新增的列
 *     （UserId/DisplayId 都預設成 userId），讓呼叫端寫回工作表——
 *     管理者之後可以隨時把 DisplayId 改成看得懂的名字，下次同一個
 *     userId 發文就會用新名字顯示，不需要预先手動登記過才會有東西。
 *
 * 資安複審（`/mycr` 深層複掃 Finding 2）：userId 是任何在已授權群組裡的
 * 成員可以自由決定的內容（見 verifyWebhookDestination.js 對 M3 的說明——
 * webhook 本身沒有簽章驗證，這道跳脫是 M3 前提被突破時的第二道防線），
 * 跟 lineStaging.js 的 buildLineStagingRow 同一個理由，「新登記」這個分支
 * 寫入前套用一致的 escapeFormulaInjection，避免管理員直接打開這張工作表
 * 查看/編輯時被觸發公式執行。
 *
 * mycr 第 15 輪票 05：escapeFormulaInjection 的規則從「只在開頭是
 * =+-@ 時才跳脫」改成「非空字串一律加前綴」之後，原本這裡的設計（讓
 * displayNameByUserId 沿用跟 newRows 同一個已跳脫過的值，理由是「日常
 * 操作下 LINE userId 格式固定不會觸發跳脫，只有在 M3 被突破時才會讓
 * 顯示名稱多一個前導單引號，可接受」）的前提已經不成立——現在「每一個
 * 第一次出現的 userId」都會被跳脫，不再是極端情境才會踩到的邊界代價，
 * 而是每天都會發生的事。newRows 仍然要跳脫（它真的會被寫進
 * LineUserId 工作表自己的欄位，屬於獨立儲存格，跳脫在這裡是真正有效的
 * 防護）；displayNameByUserId 改成用原始未跳脫的 userId，跟「已登記過的
 * userId 用 Sheets 讀回來的既有值、不額外跳脫」這條既有規則一致——
 * 顯示名稱本來就不該帶著寫入層級的跳脫痕跡，這不是接受一個邊界代價，
 * 是把顯示與寫入這兩個原本被刻意合併成一份的值，改成正確地分開維護。
 *
 * @param {Array<{userId: string, displayId: string}>} rows - LineUserId 工作表既有列
 * @param {string[]} userIds - 這批要收割的訊息裡出現的 userId（可能重複、可能是空字串）
 * @returns {{displayNameByUserId: Object<string,string>, newRows: Array<{userId:string, displayId:string}>}}
 */
var _formulaInjectionModule = (typeof require !== 'undefined') ? require('./formulaInjection') : null;

function escapeFormulaInjectionFor_(value) {
  return (_formulaInjectionModule ? _formulaInjectionModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

function resolveLineUserDisplayNames(rows, userIds) {
  var displayIdByUserId = {};
  (rows || []).forEach(function (row) {
    displayIdByUserId[row.userId] = row.displayId;
  });

  var displayNameByUserId = {};
  var newRows = [];
  var seen = {};

  (userIds || []).forEach(function (userId) {
    if (!userId || seen[userId]) {
      return;
    }
    seen[userId] = true;

    if (displayIdByUserId.hasOwnProperty(userId)) {
      displayNameByUserId[userId] = displayIdByUserId[userId];
    } else {
      // newRows 真的會被寫進 LineUserId 工作表自己獨立的欄位，跳脫在這裡
      // 是有效防護；displayNameByUserId 只是拿來替換到彙整文章內文顯示
      // 用，不寫進任何儲存格，用原始值即可，不該帶著寫入層級的跳脫痕跡。
      var escaped = escapeFormulaInjectionFor_(userId);
      displayNameByUserId[userId] = userId;
      newRows.push({ userId: escaped, displayId: escaped });
    }
  });

  return { displayNameByUserId: displayNameByUserId, newRows: newRows };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveLineUserDisplayNames: resolveLineUserDisplayNames
  };
}
