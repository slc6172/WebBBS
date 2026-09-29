// The BBS + LINE digest sheets and their header rows, per spec.
var SHEET_HEADERS = {
  // `/mycr` 深層複掃 Finding 1：credentialVersion（第 12 欄）—— 密碼重設時
  // 換成一個新的不透明值（Utilities.getUuid()），登入時把當下的值一併存進
  // session 的平行 cache key，getSessionRole_ 每次都拿即時讀到的這欄跟
  // session 建立當下存的值比對，不一致就視為 session 失效。見
  // src/login.js、src/permissions.js、src/adminResetPassword.js 的對應說明。
  Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt', 'loginCount', 'lastLoginAt', 'articleCount', 'replyCount', 'lastSeenBoards', 'pendingMentions', 'credentialVersion'],
  Boards: ['boardId', 'boardName', 'description', 'sortOrder', 'latestArticleAt', 'latestReplyAt', 'AllowRoles'],
  Articles: ['articleId', 'boardId', 'title', 'author', 'content', 'createdAt', 'editedAt', 'editedBy', 'replyCount', 'imageUrls'],
  Replies: ['replyId', 'articleId', 'author', 'content', 'createdAt'],
  Permission: ['role', 'articleRead', 'articlePost', 'articleManageOwn', 'replyRead', 'replyPost', 'replyDeleteOwn', 'leaderboard', 'login'],
  LineGroupBoards: ['groupId', 'groupName', 'boardId', 'lastDigestDate', 'todayDigestCount'],
  LineStaging: ['groupId', 'messageTime', 'displayName', 'messageType', 'content', 'webhookEventId', 'recalled'],
  LineUserId: ['userId', 'displayId'],
  // A09（安全性複查換角度輪）：只記錄稀少的高價值事件（登入鎖定觸發、
  // 管理員重設密碼、管理員代管他人文章/回覆），不是每個請求都寫一筆的
  // 完整存取 log —— 見 gas-bbs-owasp-checklist-and-fresh-eyes-findings-spec.md
  // 的 Finding A09。
  AuditLog: ['timestamp', 'actor', 'action', 'target', 'detail']
};

// 1-indexed column numbers that hold timestamp strings (e.g.
// "2026/08/01 12:34:56"). These MUST be forced to plain-text ("@") number
// format, otherwise Sheets auto-detects the date-like pattern on write and
// silently converts the cell to a Date/serial value. getValues() then
// returns a JS Date instead of the original string, which breaks every
// piece of downstream code (sort comparisons, google.script.run
// round-trips, frontend string handling) that expects createdAt/editedAt
// to stay a plain string.
var TIMESTAMP_COLUMNS = {
  Users: [5, 7],       // createdAt, lastLoginAt（優化輪 ticket 07）——lastSeenBoards（第 10 欄）是 JSON 不是時間戳記，不用鎖純文字
  Boards: [5, 6],      // latestArticleAt, latestReplyAt（看板新內容提示功能）
  Articles: [6, 7],    // createdAt, editedAt
  Replies: [5],        // createdAt
  LineGroupBoards: [4], // lastDigestDate
  LineStaging: [2],     // messageTime
  AuditLog: [1]         // timestamp
};

// Default Permission rows written the first time the Permission sheet is
// created — mirrors today's hardcoded gateByRole(['user','admin']) behaviour
// exactly, so shipping this feature doesn't change anything until an admin
// deliberately edits the sheet. Column order matches SHEET_HEADERS.Permission
// (role, articleRead, articlePost, articleManageOwn, replyRead, replyPost,
// replyDeleteOwn, leaderboard, login).
var DEFAULT_PERMISSION_ROWS = [
  ['newbie', false, false, false, false, false, false, false, true],
  ['user', true, true, true, true, true, true, true, true],
  ['admin', true, true, true, true, true, true, true, true]
];

// mycr 第 15 輪票 14（見 F-07）：每次匿名 doGet 都完整跑一次 ensureSchema
// （逐表檢查/修復表頭、格式、預設資料），穩態下量測約 20 次寫入型 + 12
// 次讀取型 SpreadsheetApp 呼叫，對每一個訪客都是浪費。改成版本閘門：
// 只有程式碼裡的 SCHEMA_VERSION 被刻意調高、且比 Script Properties 裡
// 記錄的「已套用版本」新的時候，doGet 才會真的執行完整檢查；否則只讀
// 一個屬性值，完全不碰 SpreadsheetApp。
//
// 重要規則（寫在這裡，也寫進 README，之後每一輪修改都要遵守，不是這輪
// 做完就結束）：任何一輪修改到 SHEET_HEADERS/TIMESTAMP_COLUMNS/
// DEFAULT_PERMISSION_ROWS 這幾個結構定義時，除了把 SCHEMA_VERSION 加 1，
// 執行者（不論是 AI 助理或開發者本人）還必須在對話/工作紀錄中明確提示
// 需要前往 Apps Script 編輯器手動執行一次 tools/adminMaintenanceTools.gs.js
// 的 forceEnsureSchema，不能只依賴這個版本閘門在下一位訪客載入頁面時
// 自動觸發——自動觸發的時機無法控制，可能是任何一位匿名訪客的請求，
// 不適合作為結構性異動生效的唯一保證。下面的 schema.test.js 有一個
// 守門測試，結構定義變了但版本號沒有跟著調高會讓測試失敗，提醒自己
// 別忘記做這一步，但測試不會提醒「要手動執行 forceEnsureSchema」這件
// 事本身，那一步沒有辦法用自動化測試強制，要靠人記得。
var SCHEMA_VERSION = 1;
var SCHEMA_VERSION_PROPERTY_KEY = 'appliedSchemaVersion';

/**
 * Ensures all five BBS sheets exist on the given spreadsheet with the
 * correct header row, that timestamp columns are locked to plain-text
 * format, and that the Permission sheet has sensible defaults the very
 * first time it's created. Safe to call repeatedly (idempotent) — once
 * Permission has any data row, this never touches that data again.
 * @param {Spreadsheet} spreadsheet - a SpreadsheetApp.Spreadsheet, or any
 *   object implementing getSheetByName(name) / insertSheet(name).
 * @param {function(string[]): *} [buildRoleValidationRule] - optional. If
 *   supplied, called with the current Permission role list and expected to
 *   return a DataValidation-like rule object, which is then applied to the
 *   Users.role column. In real GAS this wraps
 *   SpreadsheetApp.newDataValidation().requireValueInList(roles, true).build()
 *   — that builder lives on the global SpreadsheetApp namespace, not on
 *   anything reachable from the spreadsheet instance, so it can't be called
 *   from inside this file directly without breaking the existing
 *   dependency-injection convention. Omitted entirely by any caller that
 *   doesn't need it (all existing single-arg call sites keep working
 *   unchanged).
 */
function ensureSchema(spreadsheet, buildRoleValidationRule) {
  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    var headers = SHEET_HEADERS[sheetName];
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    // Permission sheet seeding must be decided BEFORE the header write
    // below (which always touches row 1) — getLastRow() <= 1 here means
    // "no data rows beyond the header yet", i.e. a brand-new sheet or one
    // an admin has never populated. Once any data row exists, this branch
    // never runs again for the lifetime of the sheet, no matter how many
    // times ensureSchema is called — an admin's manual edits in Permission
    // must never be silently overwritten on a later page load.
    var needsPermissionSeed = sheetName === 'Permission' && sheet.getLastRow() <= 1;

    // Boards.AllowRoles backfill must also be decided BEFORE the header
    // write below, by checking whether the OLD header already contained
    // this column. A pre-existing deployment's Boards sheet has real board
    // rows written before AllowRoles existed — leaving those blank would
    // mean "nobody but admin can see this board" per the confirmed blank
    // semantics, silently hiding every existing board the moment this
    // ships. Once the column exists, this never runs again — a board
    // added afterwards with AllowRoles left blank is the admin's own
    // deliberate choice, not something to auto-fill.
    var needsAllowRolesBackfill = false;
    if (sheetName === 'Boards') {
      var oldBoardsHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      needsAllowRolesBackfill = oldBoardsHeader.indexOf('AllowRoles') === -1;
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (needsPermissionSeed) {
      DEFAULT_PERMISSION_ROWS.forEach(function (row) {
        sheet.appendRow(row);
      });
    }

    if (needsAllowRolesBackfill) {
      var allowRolesCol = headers.indexOf('AllowRoles') + 1; // 1-indexed
      var boardsLastRow = sheet.getLastRow();
      if (boardsLastRow > 1) {
        var numDataRows = boardsLastRow - 1;
        var fillValues = [];
        for (var r = 0; r < numDataRows; r++) {
          fillValues.push(['ALL']);
        }
        sheet.getRange(2, allowRolesCol, numDataRows, 1).setValues(fillValues);
      }
    }

    var timestampCols = TIMESTAMP_COLUMNS[sheetName];
    if (timestampCols && typeof sheet.getMaxRows === 'function') {
      var maxRows = sheet.getMaxRows();
      if (maxRows > 1) {
        timestampCols.forEach(function (col) {
          sheet.getRange(2, col, maxRows - 1, 1).setNumberFormat('@');
        });
      }
    }
  });

  // Role dropdown on Users.role, sourced from whatever roles Permission
  // actually has right now — run after the loop above so a first-time
  // Permission seed is already in place before we read its role list.
  if (buildRoleValidationRule) {
    var permissionSheet = spreadsheet.getSheetByName('Permission');
    var permissionRowCount = permissionSheet.getLastRow() - 1; // minus header
    var roleNames = [];
    if (permissionRowCount > 0) {
      var roleColumn = permissionSheet.getRange(2, 1, permissionRowCount, 1).getValues();
      roleNames = roleColumn.map(function (row) { return row[0]; });
    }

    var usersSheet = spreadsheet.getSheetByName('Users');
    var usersMaxRows = usersSheet.getMaxRows();
    if (usersMaxRows > 1) {
      usersSheet.getRange(2, 4, usersMaxRows - 1, 1).setDataValidation(buildRoleValidationRule(roleNames));
    }
  }
}

/**
 * mycr 第 15 輪票 14（見 F-07）：doGet 用的版本閘門，取代直接呼叫
 * ensureSchema。ensureSchema 本身完全不變（工具、測試都還是直接呼叫
 * 它，拿到完整、不受閘門影響的檢查）。
 * @param {Spreadsheet} spreadsheet
 * @param {{get: function(string): (string|null), set: function(string, string): void}} properties
 *   注入的 properties 介面，跟 imageStorage.js 用的是同一種簡化過的
 *   get/set 形狀（GAS 環境下由 Code.js 的 createPropertiesInterface_()
 *   包出來，不是 PropertiesService.getScriptProperties() 原生的
 *   getProperty/setProperty）。
 * @param {function(string[]): *} [buildRoleValidationRule]
 */
function ensureSchemaIfNeeded_(spreadsheet, properties, buildRoleValidationRule) {
  var applied = properties.get(SCHEMA_VERSION_PROPERTY_KEY);
  if (applied !== null && parseInt(applied, 10) >= SCHEMA_VERSION) {
    return; // 已經是最新版本，不用碰 SpreadsheetApp
  }
  ensureSchema(spreadsheet, buildRoleValidationRule);
  properties.set(SCHEMA_VERSION_PROPERTY_KEY, String(SCHEMA_VERSION));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ensureSchema: ensureSchema,
    ensureSchemaIfNeeded_: ensureSchemaIfNeeded_,
    SHEET_HEADERS: SHEET_HEADERS,
    TIMESTAMP_COLUMNS: TIMESTAMP_COLUMNS,
    DEFAULT_PERMISSION_ROWS: DEFAULT_PERMISSION_ROWS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SCHEMA_VERSION_PROPERTY_KEY: SCHEMA_VERSION_PROPERTY_KEY
  };
}