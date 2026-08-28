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
 * @param {Array<{userId: string, displayId: string}>} rows - LineUserId 工作表既有列
 * @param {string[]} userIds - 這批要收割的訊息裡出現的 userId（可能重複、可能是空字串）
 * @returns {{displayNameByUserId: Object<string,string>, newRows: Array<{userId:string, displayId:string}>}}
 */
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
      displayNameByUserId[userId] = userId;
      newRows.push({ userId: userId, displayId: userId });
    }
  });

  return { displayNameByUserId: displayNameByUserId, newRows: newRows };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveLineUserDisplayNames: resolveLineUserDisplayNames
  };
}
