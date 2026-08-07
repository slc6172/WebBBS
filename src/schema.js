// The four BBS sheets and their header rows, per spec.
var SHEET_HEADERS = {
  Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt'],
  Boards: ['boardId', 'boardName', 'description', 'sortOrder'],
  Articles: ['articleId', 'boardId', 'title', 'author', 'content', 'createdAt', 'editedAt', 'editedBy', 'replyCount'],
  Replies: ['replyId', 'articleId', 'author', 'content', 'createdAt']
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
  Users: [5],        // createdAt
  Articles: [6, 7],  // createdAt, editedAt
  Replies: [5]        // createdAt
};

/**
 * Ensures all four BBS sheets exist on the given spreadsheet with the
 * correct header row, and that timestamp columns are locked to plain-text
 * format so future writes of date-like strings aren't reinterpreted as
 * Date values by Sheets. Safe to call repeatedly (idempotent).
 * @param {Spreadsheet} spreadsheet - a SpreadsheetApp.Spreadsheet, or any
 *   object implementing getSheetByName(name) / insertSheet(name).
 */
function ensureSchema(spreadsheet) {
  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    var headers = SHEET_HEADERS[sheetName];
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ensureSchema: ensureSchema, SHEET_HEADERS: SHEET_HEADERS };
}