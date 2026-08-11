const { login, getUserRecord_ } = require('../src/login');
const { registerUser } = require('../src/register');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeCache } = require('./doubles/fakeCache');

function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

function seedUser(ss, overrides) {
  ensureSchema(ss);
  registerUser(ss, createFakeLock(), fakeDigest, Object.assign({
    userId: 'alice01',
    password: 'password123',
    salt: 'fixed-salt',
    createdAt: '2026/07/30 12:00:00'
  }, overrides));
}

test('login succeeds with correct credentials and returns a token', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'password123'
  });

  expect(result.success).toBe(true);
  expect(result.token).toBe('fixed-token-123');
});

test('login fails with a generic error when the password is wrong, and increments the failure count', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'wrong-password'
  });

  expect(result).toEqual({ success: false, error: 'userId 或密碼錯誤' });
  expect(cache.get('loginFail_alice01')).toBe('1');
});

test('login locks the account after 5 failed attempts, rejecting even a correct password', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  for (let i = 0; i < 5; i++) {
    login(ss, cache, function () { return 'token-' + i; }, fakeDigest, '2026/08/05 09:00:00', {
      userId: 'alice01',
      password: 'wrong-password'
    });
  }

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'password123'
  });

  expect(result).toEqual({ success: false, error: '帳號已被暫時鎖定,請稍後再試' });
});

test('a successful login resets the failure count', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'wrong-password'
  });
  login(ss, cache, function () { return 'token-b'; }, fakeDigest, '2026/08/05 09:01:00', {
    userId: 'alice01',
    password: 'password123'
  });

  expect(cache.get('loginFail_alice01')).toBeNull();
});

// ---- 登入統計（優化輪 ticket 07）----

test('the very first login for a freshly registered user reports loginCount 1 and no previous lastLoginAt', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss); // never logged in before — loginCount/lastLoginAt columns are blank
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'password123'
  });

  expect(result.success).toBe(true);
  expect(result.loginCount).toBe(1);
  expect(result.lastLoginAt).toBe('');
});

test('a second login reports loginCount 2 and lastLoginAt equal to the FIRST login\'s timestamp, not the current one', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'password123'
  });
  const second = login(ss, cache, function () { return 'token-b'; }, fakeDigest, '2026/08/06 10:30:00', {
    userId: 'alice01',
    password: 'password123'
  });

  expect(second.loginCount).toBe(2);
  expect(second.lastLoginAt).toBe('2026/08/05 09:00:00');
});

test('login stats are persisted back to the Users sheet, not just returned in memory', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'password123'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.loginCount).toBe(1);
  expect(record.lastLoginAt).toBe('2026/08/05 09:00:00');
});

test('a failed login attempt does not change loginCount or lastLoginAt', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'wrong-password'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.loginCount).toBe(0);
  expect(record.lastLoginAt).toBe('');
});

// ---- lastSeenBoards（看板新內容提示功能）----

test('getUserRecord_ reads lastSeenBoards (column 10), defaulting to empty string when never set', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');

  expect(record.lastSeenBoards).toBe('');
});

test('getUserRecord_ reads a populated lastSeenBoards JSON blob as-is (parsing is boardActivity.js\'s job, not this function\'s)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  sheet.appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 0, '{"gossip":"2026/08/05 10:00:00"}']);

  const record = getUserRecord_(sheet, 'alice01');

  expect(record.lastSeenBoards).toBe('{"gossip":"2026/08/05 10:00:00"}');
});
