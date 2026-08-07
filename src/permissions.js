/**
 * Ticket 04 — three-tier permission gate.
 * Reuses login.js's session-lookup helper and prefix constant. Same
 * require pattern as login.js's own reuse of register.js: avoids
 * declaring a local `getUserRecord_` binding that would shadow the GAS
 * global.
 */
var _loginModule = (typeof require !== 'undefined') ? require('./login') : null;

function getUserRecordFor_(sheet, userId) {
  return (_loginModule ? _loginModule.getUserRecord_ : getUserRecord_)(sheet, userId);
}

function sessionPrefixFor_() {
  return _loginModule ? _loginModule.SESSION_PREFIX : SESSION_PREFIX;
}

/**
 * Looks up the role for the user behind a session token. Deliberately
 * re-reads the Users sheet on every call rather than caching the role
 * alongside the token, so an admin's change to a user's role (made
 * directly on the spreadsheet) takes effect on the very next call —
 * no waiting for the session to expire.
 * @param {Cache} cache
 * @param {Spreadsheet} spreadsheet
 * @param {string} token
 * @returns {string|null} the user's current role, or null if the token
 *   doesn't map to a logged-in user
 */
function getSessionRole(cache, spreadsheet, token) {
  var userId = cache.get(sessionPrefixFor_() + token);
  if (!userId) {
    return null;
  }
  var sheet = spreadsheet.getSheetByName('Users');
  var record = getUserRecordFor_(sheet, userId);
  return record ? record.role : null;
}

/**
 * The single permission check point every board/article/reply function
 * calls. `role` may be null (not logged in / token expired), in which
 * case it's never in any allowed-roles list, so this correctly rejects.
 * @param {string|null} role
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
function gateByRole(role, allowedRoles) {
  return allowedRoles.indexOf(role) !== -1;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getSessionRole: getSessionRole, gateByRole: gateByRole };
}