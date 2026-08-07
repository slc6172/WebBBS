/**
 * Ticket 14 — admin manual password reset.
 * Deliberately has no *ForRole wrapper and is never wired to any
 * google.script.run entry point in Code.js — this function only exists
 * to be run manually from within the Apps Script editor by the admin,
 * never reachable from the deployed web page.
 */
var _registerModule = (typeof require !== 'undefined') ? require('./register') : null;

function validatePasswordFor_(password) {
  return (_registerModule ? _registerModule.validatePassword : validatePassword)(password);
}

function hashPasswordFor_(password, salt, digestFn) {
  return (_registerModule ? _registerModule.hashPassword : hashPassword)(password, salt, digestFn);
}

/**
 * Finds which row (1-indexed) holds the given userId in a Users-shaped
 * sheet, skipping the header row.
 */
function findUserRowNumber_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === userId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Overwrites a user's passwordHash/salt with a freshly hashed new
 * password.
 * @param {Spreadsheet} spreadsheet
 * @param {function(string): number[]} digestFn
 * @param {string} userId
 * @param {string} newPassword
 * @param {string} newSalt - caller-supplied (e.g. Utilities.getUuid()
 *   when run for real), same pattern as registerUser taking salt as input.
 * @returns {{success: boolean, error?: string}}
 */
function resetPassword(spreadsheet, digestFn, userId, newPassword, newSalt) {
  var sheet = spreadsheet.getSheetByName('Users');
  var row = findUserRowNumber_(sheet, userId);
  if (row === null) {
    return { success: false, error: '使用者不存在' };
  }

  var passwordCheck = validatePasswordFor_(newPassword);
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error };
  }

  var newHash = hashPasswordFor_(newPassword, newSalt, digestFn);
  sheet.getRange(row, 2, 1, 1).setValues([[newHash]]); // B=passwordHash
  sheet.getRange(row, 3, 1, 1).setValues([[newSalt]]); // C=salt

  return { success: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resetPassword: resetPassword };
}