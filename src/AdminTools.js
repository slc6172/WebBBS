/**
 * ADMIN MANUAL USE ONLY.
 *
 * This file has no google.script.run entry point anywhere and is never
 * called from Index.html or Code.js. It exists purely so the admin can
 * open this project in the Apps Script editor, edit the two constants
 * below, select `resetUserPasswordManually` from the function dropdown,
 * and click Run.
 *
 * Steps:
 * 1. Edit TARGET_USER_ID and NEW_PASSWORD below.
 * 2. Select "resetUserPasswordManually" in the editor's function dropdown.
 * 3. Click Run. Check the execution log (View > Logs) for the result.
 * 4. Put the placeholder values back afterwards so they aren't left
 *    sitting in the source with a real password.
 */
function resetUserPasswordManually() {
  var TARGET_USER_ID = 'PUT_USER_ID_HERE';
  var NEW_PASSWORD = 'PUT_NEW_PASSWORD_HERE';

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };
  var newSalt = Utilities.getUuid();

  var result = resetPassword(spreadsheet, digestFn, TARGET_USER_ID, NEW_PASSWORD, newSalt);
  Logger.log(JSON.stringify(result));
}