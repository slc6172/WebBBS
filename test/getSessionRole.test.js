const { getSessionRole } = require('../src/permissions');
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
