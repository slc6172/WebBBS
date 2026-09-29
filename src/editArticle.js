/**
 * Ticket 10 — editing your own article.
 * Reuses validateArticleTitle/validateArticleContent/escapeFormulaInjection
 * from postArticle.js — edits follow the same rules as new posts.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;
var _auditLogModule = (typeof require !== 'undefined') ? require('./auditLog') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

function validateArticleTitleFor_(title) {
  return (_postArticleModule ? _postArticleModule.validateArticleTitle : validateArticleTitle)(title);
}

function validateArticleContentFor_(content) {
  return (_postArticleModule ? _postArticleModule.validateArticleContent : validateArticleContent)(content);
}

function escapeFormulaInjectionFor_(value) {
  return (_postArticleModule ? _postArticleModule.escapeFormulaInjection : escapeFormulaInjection)(value);
}

function extractFileIdFromUrlFor_(url) {
  return (_imageStorageModule ? _imageStorageModule.extractFileIdFromUrl : extractFileIdFromUrl)(url);
}

function deleteArticleImageFor_(drive, fileId) {
  return (_imageStorageModule ? _imageStorageModule.deleteArticleImage : deleteArticleImage)(drive, fileId);
}

function compactImageUrlsFor_(urls) {
  return (_imageStorageModule ? _imageStorageModule.compactImageUrls : compactImageUrls)(urls);
}

function appendAuditLogEntryFor_(spreadsheet, nowTimestamp, actor, action, target, detail) {
  return (_auditLogModule ? _auditLogModule.appendAuditLogEntry_ : appendAuditLogEntry_)(spreadsheet, nowTimestamp, actor, action, target, detail);
}

function auditActionsFor_() {
  return _auditLogModule ? _auditLogModule.AUDIT_ACTIONS : AUDIT_ACTIONS;
}

/**
 * Finds the row number, current author, and image URLs for an articleId, or null.
 * 優化輪 ticket 10：多帶出 imageUrls，編輯時才知道舊圖片是什麼，才能跟新的
 * 圖片清單比對出哪些被移除/替換掉了。
 *
 * mycr 第 15 輪票 12：原本這支函式跟 deleteArticle.js 同名（都叫
 * findArticleRowAndAuthor_）、內容幾乎一樣，只是碰巧兩邊都還沒帶
 * createdAt。這次修法需要帶出 createdAt（鎖內合併寫入要原樣保留這一
 * 欄，見 editArticle 內的說明），一旦兩邊回傳的形狀不一樣，就會踩到
 * 票 06 剛修過的同一類問題——GAS 共用全域命名空間下，同名函式最終生效
 * 的是哪一份，取決於部署時的檔案載入順序。改名成專屬於這個檔案的名稱，
 * 不是硬把 deleteArticle.js 也拖著一起改（它不需要 createdAt，沒有理由
 * 幫它加一個用不到的欄位）。
 */
function findArticleRowAndAuthorForEdit_(sheet, articleId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return {
        rowNumber: i + 2,
        boardId: rows[i][1],
        author: rows[i][3],
        createdAt: rows[i][5], // mycr 第 15 輪票 12：合併寫入需要原樣保留這欄，見 editArticle 內的說明
        imageUrls: parseImageUrlsCell_(rows[i][9])
      };
    }
  }
  return null;
}

/**
 * 圖片張數突破：Articles 表的圖片欄位從 imageUrl1~3 三欄合併成單一個
 * JSON 陣列字串欄位。空值的標準表示法是 '[]'；任何無法解析的內容（理論上
 * 不該發生，防禦性處理）都當成沒有圖片，不噴錯。
 * @param {string} cellValue
 * @returns {Array<string>}
 */
function parseImageUrlsCell_(cellValue) {
  if (!cellValue) {
    return [];
  }
  try {
    var parsed = JSON.parse(cellValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Overwrites title/content/editedAt/editedBy on an existing article.
 *
 * mycr 第 15 輪票 12（見 F-09）：這支函式原本完全不取鎖，理由寫的是
 * 「這是覆寫既有列的特定儲存格，不是插入新資料或維護計數器，兩個編輯
 * 互相覆蓋是普通的編輯衝突，不是結構性損壞」——這個判斷對「兩個編輯
 * 互相覆蓋」是對的，但漏算了另一種情況：這支函式在「查到列號」跟
 * 「真正寫入」之間完全不取鎖，如果這段時間內剛好有另一個操作（例如
 * deleteArticle，持鎖、會用 deleteRow 讓後面所有列的列號往前位移）
 * 刪除了更早的一列，這裡用的列號就已經失效，寫入結果會落在別人的
 * 文章上——不是「覆蓋自己這篇文章的編輯衝突」，是「寫錯文章」，性質
 * 完全不同。修法：取全站鎖，鎖內重新以 articleId 定位一次列號才寫入，
 * 確保寫入當下用的列號一定是最新的。
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {string} requestingUserId
 * @param {string} articleId
 * @param {{title: string, content: string, editedAt: string, imageUrls?: string[]}} updates
 *   優化輪 ticket 10：imageUrls 是「編輯後想要的最終 3 個圖片欄位」（已經上傳好的
 *   新圖連結 + 保留的舊圖連結混在一起，由 Code.js 組好傳進來）。省略這個欄位
 *   代表這次編輯完全不碰圖片，保留原樣。
 * @param {boolean} [isAdmin] - when true, skips the author===requestingUserId
 *   check (ticket 12); editedBy is still requestingUserId (the admin who
 *   made the edit), not the original author.
 * @param {Drive} [drive] - 優化輪 ticket 10：注入的 drive 介面，用來刪除被替換
 *   掉或移除的舊圖片。updates.imageUrls 省略、或沒有任何圖片被移除/替換時，
 *   完全不會用到，可以省略。
 * @returns {{success: boolean, error?: string}}
 */
function editArticle(spreadsheet, lock, requestingUserId, articleId, updates, isAdmin, drive) {
  var sheet = spreadsheet.getSheetByName('Articles');
  // 這裡的 found 只用來做「文章存不存在／誰是作者／輸入格式對不對」這些
  // 不依賴列號本身、鎖之前就能安全判斷的檢查——真正決定要寫哪一列，見
  // 下面鎖內重新查一次的 fresh。
  var found = findArticleRowAndAuthorForEdit_(sheet, articleId);
  if (!found) {
    return { success: false, error: '文章不存在' };
  }
  if (!isAdmin && found.author !== requestingUserId) {
    return { success: false, error: '權限不足' };
  }

  var titleCheck = validateArticleTitleFor_(updates.title);
  if (!titleCheck.valid) {
    return { success: false, error: titleCheck.error };
  }
  var contentCheck = validateArticleContentFor_(updates.content);
  if (!contentCheck.valid) {
    return { success: false, error: contentCheck.error };
  }

  // A09：只有驗證都通過、真的會寫入時才記——理由跟 deleteArticle.js/
  // deleteReply.js 一樣「只在事情真的發生時才留紀錄」，但這裡多一個
  // 原因：edit 在通過擁有權檢查之後還有 title/content 驗證這一關，
  // 驗證沒過就不該留下「代管別人文章」這筆紀錄，因為實際上什麼都
  // 沒改到。時間戳記直接沿用 updates.editedAt（呼叫端本來就要提供
  // 這個值），不用另外加參數。
  if (isAdmin && found.author !== requestingUserId) {
    appendAuditLogEntryFor_(spreadsheet, updates.editedAt, requestingUserId, auditActionsFor_().ADMIN_EDIT_OTHERS_CONTENT, articleId, '原作者：' + found.author);
  }

  lock.waitLock(10000);
  try {
    // mycr 第 15 輪票 12：鎖內重新定位，不沿用鎖之前查到的 found.rowNumber
    // ——這一步是這次修法真正的重點，見函式上方的完整說明。
    var fresh = findArticleRowAndAuthorForEdit_(sheet, articleId);
    if (!fresh) {
      // 鎖之前存在、真正要寫入前重新確認時已經不存在，是比「列號位移」
      // 更罕見、但邏輯上仍然可能發生的競態（例如剛好在這極窄的時間窗內
      // 被整篇刪除）——回傳錯誤，不寫入任何東西，不當成例外處理。
      return { success: false, error: '文章不存在' };
    }
    var row = fresh.rowNumber;
    // 合併寫入：C~H 這六欄在 Articles 表裡是連續欄位（title/author/
    // content/createdAt/editedAt/editedBy），原本分成 4 次 setValues
    // （title/content/editedAt/editedBy），現在併成 1 次。author 跟
    // createdAt 這兩欄這次編輯沒有要改，用鎖內剛讀到的最新值原樣寫回去
    // ——createdAt 沿用既有慣例補回 `'` 前綴（getValues() 讀回來的值已經
    // 被 Sheets 自動去掉前綴，原樣寫回去不補前綴會被重新誤判成日期）；
    // author 一併套用 escapeFormulaInjectionFor_，防禦性處理修法前就存在
    // 的舊帳號萬一剛好是純數字字串的邊界情況（票 02 之後新註冊不會再有
    // 這種帳號，但既有帳號沒有被追溯修正）。
    sheet.getRange(row, 3, 1, 6).setValues([[
      escapeFormulaInjectionFor_(updates.title),
      escapeFormulaInjectionFor_(fresh.author),
      escapeFormulaInjectionFor_(updates.content),
      "'" + fresh.createdAt,
      "'" + updates.editedAt,
      requestingUserId
    ]]);

    if (updates.imageUrls) {
      // 圖片張數突破：先把可能還留著空位的陣列（前端固定格子年代的殘留
      // 語意，或編輯時某格被清空）壓成不留空缺的乾淨陣列，是最終要存進
      // Sheets 的實際內容。
      //
      // mycr 第 15 輪票 05：這裡原本對陣列裡每個 URL 逐一套用
      // escapeFormulaInjectionFor_（「縱深防禦」），但 imageUrls 是整包
      // JSON.stringify 之後才寫進第 10 欄「一整格」，不是每個 URL 各自
      // 佔一格——Sheets 的公式/型別誤判只發生在整格層級，這一整格永遠是
      // `[` 開頭，不可能被誤判，對陣列元素逐一跳脫從來沒有真的防到任何
      // 風險。escapeFormulaInjection 現在改成「非空字串一律加前綴」後，
      // 繼續套用會讓 parseImageUrlsCell_ 讀回來的每個 URL 都多一個游離的
      // 撇號（純 JSON.parse，不會像 Sheets 對整格那樣自動去除），等於讓
      // 圖片直接打不開，所以拿掉這裡的跳脫。
      var compactedUrls = compactImageUrlsFor_(updates.imageUrls);
      var newUrls = compactedUrls;
      sheet.getRange(row, 10, 1, 1).setValues([[JSON.stringify(newUrls)]]); // J = imageUrls（單一 JSON 欄位）

      fresh.imageUrls
        .filter(function (oldUrl) { return newUrls.indexOf(oldUrl) === -1; }) // 舊圖沒出現在新清單裡 = 被移除或替換掉了
        .forEach(function (oldUrl) {
          var fileId = extractFileIdFromUrlFor_(oldUrl);
          if (fileId) {
            deleteArticleImageFor_(drive, fileId);
          }
        });
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * admin bypasses everything below (Permission table + AllowRoles), same
 * hardcoded special case as deleteArticle.js — this is the one deliberate
 * exception the whole permission system carries, not something meant to
 * be configurable via the Permission sheet.
 * Non-admin roles need the articleManageOwn permission AND the article's
 * own board's AllowRoles to allow them, on top of the ownership check
 * already inside editArticle. Looking up the board here means reading
 * the article row once more than editArticle's own lookup below — a
 * small duplicate read accepted for a low-frequency action, not the
 * cached high-frequency read path ticket 03 was built to protect.
 */
function editArticleForRole_(spreadsheet, lock, role, requestingUserId, articleId, updates, drive) {
  if (role !== 'admin') {
    if (!getRolePermissionsFor_(spreadsheet, role).articleManageOwn) {
      return { success: false, error: '權限不足' };
    }
    var found = findArticleRowAndAuthorForEdit_(spreadsheet.getSheetByName('Articles'), articleId);
    if (!found) {
      return { success: false, error: '文章不存在' };
    }
    if (!boardAllowsRoleByIdFor_(spreadsheet, found.boardId, role)) {
      return { success: false, error: '權限不足' };
    }
  }
  return editArticle(spreadsheet, lock, requestingUserId, articleId, updates, role === 'admin', drive);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { editArticle: editArticle, editArticleForRole_: editArticleForRole_ };
}
