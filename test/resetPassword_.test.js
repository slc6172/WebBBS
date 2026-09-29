const { resetPassword_ } = require('../src/adminResetPassword');
const { registerUser_: registerUser, hashPassword } = require('../src/register');
const { verifyPassword, CREDENTIAL_REVOCATION_PREFIX } = require('../src/login');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeCache } = require('./doubles/fakeCache');

function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

function seedUser(ss) {
  ensureSchema(ss);
  registerUser(ss, createFakeLock(), fakeDigest, {
    userId: 'alice01',
    password: 'old-password',
    salt: 'old-salt',
    createdAt: '2026/07/30 12:00:00'
  });
}

test('resetPassword_ updates passwordHash/salt so the new password verifies correctly', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = resetPassword_(ss, cache, fakeDigest, 'alice01', 'brand-new-password', 'new-salt', 'admin01', '2026/09/16 10:00:00', 'new-credential-version');

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 5).getValues()[0];
  expect(row[2]).toBe('new-salt');
  expect(verifyPassword(row[1], row[2], 'brand-new-password', fakeDigest)).toBe(true);
  expect(verifyPassword(row[1], row[2], 'old-password', fakeDigest)).toBe(false);

  // A09：一次成功的重設要留下剛好一筆稽核紀錄，記錄是誰、對誰、什麼時候。
  const auditSheet = ss.getSheetByName('AuditLog');
  const auditRows = auditSheet.getRange(1, 1, auditSheet.getLastRow(), 5).getValues();
  expect(auditRows.length).toBe(2); // 標題列 + 這一筆
  expect(auditRows[1][1]).toBe('admin01');
  expect(auditRows[1][2]).toBe('ADMIN_RESET_PASSWORD');
  expect(auditRows[1][3]).toBe('alice01');
});

// `/mycr` 深層複掃 Finding 1 的迴歸測試：密碼重設要換一個新的
// credentialVersion，這是讓既有 session 立刻失效的唯一掛載點——
// 見 permissions.js 的 getSessionRole_。
test('resetPassword_ writes the new credentialVersion to column 12, invalidating any session created before this reset', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss); // 從沒重設過密碼，這欄目前是空字串
  const cache = createFakeCache();

  const result = resetPassword_(ss, cache, fakeDigest, 'alice01', 'brand-new-password', 'new-salt', 'admin01', '2026/09/16 10:00:00', 'version-after-reset');

  expect(result).toEqual({ success: true });
  const credentialVersionCell = ss.getSheetByName('Users').getRange(2, 12, 1, 1).getValues()[0][0];
  expect(credentialVersionCell).toBe('version-after-reset');
});

// mycr 第 15 輪票 11（見 F-02）：這是讓讀取類端點（getBoardsFromToken 等）
// 也能偵測到撤銷的那一半——寫進 Users 表第 12 欄只有 getSessionRole_
// （即時重讀 Users 表的寫入路徑）看得到，讀取路徑刻意不重讀 Users 表，
// 需要這把獨立的 cache key 才能在不增加 SpreadsheetApp 呼叫的前提下
// 知道「這個 userId 的密碼剛剛被重設過」。
test('resetPassword_ also writes the new credentialVersion to a cache-only revocation marker, keyed by userId (for read-path endpoints that never re-read the Users sheet)', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  resetPassword_(ss, cache, fakeDigest, 'alice01', 'brand-new-password', 'new-salt', 'admin01', '2026/09/16 10:00:00', 'version-after-reset');

  expect(cache.get(CREDENTIAL_REVOCATION_PREFIX + 'alice01')).toBe('version-after-reset');
});

test('resetPassword_ rejects a new password that is too short and makes no changes (including the revocation marker)', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();
  const originalHash = ss.getSheetByName('Users').getRange(2, 2, 1, 1).getValues()[0][0];
  const originalCredentialVersionCell = ss.getSheetByName('Users').getRange(2, 12, 1, 1).getValues()[0][0];

  const result = resetPassword_(ss, cache, fakeDigest, 'alice01', 'short', 'new-salt', 'admin01', '2026/09/16 10:00:00', 'should-not-be-written');

  expect(result).toEqual({ success: false, error: '密碼長度至少需要8碼' });
  const hashAfter = ss.getSheetByName('Users').getRange(2, 2, 1, 1).getValues()[0][0];
  expect(hashAfter).toBe(originalHash);
  // 沒有真的改到密碼的情況下，credentialVersion 也不該被動到。
  const credentialVersionAfter = ss.getSheetByName('Users').getRange(2, 12, 1, 1).getValues()[0][0];
  expect(credentialVersionAfter).toBe(originalCredentialVersionCell);
  // A09：沒有真的改到密碼，不該留下稽核紀錄——只有標題列。
  expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(1);
  // 密碼沒有真的被改，撤銷標記也不該被寫入。
  expect(cache.get(CREDENTIAL_REVOCATION_PREFIX + 'alice01')).toBeNull();
});

test('resetPassword_ rejects a nonexistent userId', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const cache = createFakeCache();

  const result = resetPassword_(ss, cache, fakeDigest, 'does-not-exist', 'brand-new-password', 'new-salt', 'admin01', '2026/09/16 10:00:00');

  expect(result).toEqual({ success: false, error: '使用者不存在' });
  expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(1);
});
