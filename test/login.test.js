const { login } = require('../src/login');
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

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, {
    userId: 'alice01',
    password: 'password123'
  });

  expect(result).toEqual({ success: true, token: 'fixed-token-123' });
});

test('login fails with a generic error when the password is wrong, and increments the failure count', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, {
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
    login(ss, cache, function () { return 'token-' + i; }, fakeDigest, {
      userId: 'alice01',
      password: 'wrong-password'
    });
  }

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, {
    userId: 'alice01',
    password: 'password123'
  });

  expect(result).toEqual({ success: false, error: '帳號已被暫時鎖定,請稍後再試' });
});

test('a successful login resets the failure count', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, {
    userId: 'alice01',
    password: 'wrong-password'
  });
  login(ss, cache, function () { return 'token-b'; }, fakeDigest, {
    userId: 'alice01',
    password: 'password123'
  });

  expect(cache.get('loginFail_alice01')).toBeNull();
});
