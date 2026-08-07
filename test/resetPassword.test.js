const { resetPassword } = require('../src/adminResetPassword');
const { registerUser, hashPassword } = require('../src/register');
const { verifyPassword } = require('../src/login');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

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

test('resetPassword updates passwordHash/salt so the new password verifies correctly', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);

  const result = resetPassword(ss, fakeDigest, 'alice01', 'brand-new-password', 'new-salt');

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 5).getValues()[0];
  expect(row[2]).toBe('new-salt');
  expect(verifyPassword(row[1], row[2], 'brand-new-password', fakeDigest)).toBe(true);
  expect(verifyPassword(row[1], row[2], 'old-password', fakeDigest)).toBe(false);
});

test('resetPassword rejects a new password that is too short and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const originalHash = ss.getSheetByName('Users').getRange(2, 2, 1, 1).getValues()[0][0];

  const result = resetPassword(ss, fakeDigest, 'alice01', 'short', 'new-salt');

  expect(result).toEqual({ success: false, error: '密碼長度至少需要6碼' });
  const hashAfter = ss.getSheetByName('Users').getRange(2, 2, 1, 1).getValues()[0][0];
  expect(hashAfter).toBe(originalHash);
});

test('resetPassword rejects a nonexistent userId', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = resetPassword(ss, fakeDigest, 'does-not-exist', 'brand-new-password', 'new-salt');

  expect(result).toEqual({ success: false, error: '使用者不存在' });
});
