const { getSessionRole_: getSessionRole } = require('../src/permissions');
const { registerUser_: registerUser } = require('../src/register');
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
    password: 'correct-horse-battery-staple',
    salt: 'fixed-salt',
    createdAt: '2026/07/30 12:00:00'
  }, overrides));
}

test('getSessionRole returns null when the token is not found in the cache', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  expect(getSessionRole(cache, ss, 'unknown-token')).toBeNull();
});

test('getSessionRole returns the user\'s current role for a valid token', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();
  cache.put('session_tok123', 'alice01');

  expect(getSessionRole(cache, ss, 'tok123')).toBe('newbie');
});

test('getSessionRole reflects a role change made directly on the sheet — it never caches the role itself', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();
  cache.put('session_tok123', 'alice01');
  expect(getSessionRole(cache, ss, 'tok123')).toBe('newbie');

  // Simulate the admin manually changing the role cell on the Users sheet.
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['user']]);

  expect(getSessionRole(cache, ss, 'tok123')).toBe('user');
});

// ---- credentialVersion（`/mycr` 深層複掃 Finding 1）----

test('getSessionRole returns the role when the cached session version matches the Users sheet\'s current credentialVersion', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 12, 1, 1).setValues([['v1']]);
  const cache = createFakeCache();
  cache.put('session_tok123', 'alice01');
  cache.put('sessionVer_tok123', 'v1');

  expect(getSessionRole(cache, ss, 'tok123')).toBe('newbie');
});

test('getSessionRole returns null when the account\'s password was reset after this token was issued (cached version no longer matches)', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();
  cache.put('session_tok123', 'alice01');
  cache.put('sessionVer_tok123', 'v1'); // 這個 token 核發當下的 credentialVersion

  // 模擬 resetPassword_ 之後把 Users 表的 credentialVersion 換成新值。
  ss.getSheetByName('Users').getRange(2, 12, 1, 1).setValues([['v2-after-reset']]);

  expect(getSessionRole(cache, ss, 'tok123')).toBeNull();
});

test('getSessionRole still returns the role for a legacy session with no cached version key at all (transitional fallback, not a security regression)', () => {
  // 這個機制上線那一刻既有的舊 session 是在 SESSION_VERSION_PREFIX 這個
  // 平行 key 存在之前建立的，cache 裡完全沒有這一把——放行而不是連帶讓
  // 所有舊 session 失效，反正這批 session 本來就會在 TTL 內自然過期。
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();
  cache.put('session_tok123', 'alice01'); // 沒有對應的 sessionVer_tok123

  expect(getSessionRole(cache, ss, 'tok123')).toBe('newbie');
});
