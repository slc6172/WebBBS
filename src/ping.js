var PING_SHEET_NAME = '_Ping';

/**
 * Writes valueToWrite into a dedicated _Ping sheet (kept separate from the
 * real BBS data sheets) and reads it straight back, proving the
 * write-then-read path against the spreadsheet works end to end.
 * @param {Spreadsheet} spreadsheet
 * @param {string} valueToWrite - caller supplies the value (e.g. a
 *   timestamp string) so this function stays a pure round trip and doesn't
 *   need to reach for the system clock itself.
 * @returns {string} the value read back from the sheet
 */
function pingRoundTrip(spreadsheet, valueToWrite) {
  var sheet = spreadsheet.getSheetByName(PING_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PING_SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, 1).setValues([[valueToWrite]]);
  return sheet.getRange(1, 1, 1, 1).getValues()[0][0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pingRoundTrip: pingRoundTrip, PING_SHEET_NAME: PING_SHEET_NAME };
}