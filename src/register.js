/**
 * Ticket 02 — user registration.
 * All functions here live in the same file (rather than split further)
 * because in the deployed GAS project they share one global namespace
 * anyway with no real module boundary; grouping the cohesive
 * "registration" behaviors together avoids inventing a Node-only
 * require() wiring that GAS can't use.
 */

var USER_ID_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * @param {string} userId
 * @returns {{valid: boolean, error?: string}}
 */
function validateUserId(userId) {
  if (typeof userId !== 'string' || userId.length < 4 || userId.length > 20) {
    return { valid: false, error: 'userId 長度需為 4~20 字元' };
  }
  if (!USER_ID_PATTERN.test(userId)) {
    return { valid: false, error: 'userId 只能包含英數字與底線' };
  }
  return { valid: true };
}

/**
 * @param {string} password
 * @returns {{valid: boolean, error?: string}}
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    return { valid: false, error: '密碼長度至少需要6碼' };
  }
  return { valid: true };
}

/**
 * Converts a byte array (as returned by GAS's Utilities.computeDigest,
 * which uses signed bytes) into a lowercase hex string.
 */
function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var unsigned = b < 0 ? b + 256 : b;
    var hex = unsigned.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * @param {string} password
 * @param {string} salt
 * @param {function(string): number[]} digestFn - in production this is
 *   `function (s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s); }`,
 *   injected so this function has no direct dependency on the GAS runtime.
 * @returns {string} hex-encoded hash
 */
function hashPassword(password, salt, digestFn) {
  var bytes = digestFn(password + salt);
  return bytesToHex_(bytes);
}

/**
 * Finds which row (1-indexed, matching Sheets' own numbering) holds the
 * given userId in a Users-shaped sheet, skipping the header row.
 * Returns null if no match.
 */
function findUserRow_(sheet, userId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === userId) {
      return i + 2;
    }
  }
  return null;
}

/**
 * Registers a new user: validates format, checks uniqueness and writes
 * the row under a lock, hashes the password, and hard-codes role to
 * 'newbie' — there is no parameter through which a caller could set any
 * other role.
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock - e.g. LockService.getScriptLock() in production
 * @param {function(string): number[]} digestFn
 * @param {{userId: string, password: string, salt: string, createdAt: string}} input
 * @returns {{success: boolean, error?: string}}
 */
function registerUser(spreadsheet, lock, digestFn, input) {
  var userIdCheck = validateUserId(input.userId);
  if (!userIdCheck.valid) {
    return { success: false, error: userIdCheck.error };
  }
  var passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error };
  }

  lock.waitLock(10000);
  try {
    var sheet = spreadsheet.getSheetByName('Users');
    if (findUserRow_(sheet, input.userId) !== null) {
      return { success: false, error: 'userId 已被使用' };
    }
    var passwordHash = hashPassword(input.password, input.salt, digestFn);
    sheet.appendRow([input.userId, passwordHash, input.salt, 'newbie', "'" + input.createdAt]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateUserId: validateUserId,
    validatePassword: validatePassword,
    hashPassword: hashPassword,
    registerUser: registerUser
  };
}