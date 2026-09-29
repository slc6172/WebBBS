const { isSessionValidFor_ } = require('../src/permissions');
const { createFakeCache } = require('./doubles/fakeCache');
const { SESSION_PREFIX, SESSION_VERSION_PREFIX, CREDENTIAL_REVOCATION_PREFIX } = require('../src/login');

// mycr 第 15 輪票 11（見 F-02）：讀取類端點（getBoardsFromToken/
// getBoardBulkFromToken/getArticleDetailFromToken）撤銷檢查用的判斷式。
// 只靠兩次快取讀取（不重讀 Users 表），所以熱路徑不增加任何
// SpreadsheetApp 呼叫——跟 getSessionRole_（寫入路徑，即時重讀 Users 表）
// 是同一個問題的兩種解法，這裡刻意選擇比對兩把平行 cache key，而不是
// 比對 Sheets 裡的即時值。

test('returns false when there is no session at all (token expired or never existed)', () => {
  const cache = createFakeCache();

  expect(isSessionValidFor_(cache, 'nonexistent-token')).toBe(false);
});

test('returns true when the session exists and no credential-revocation marker has ever been recorded for this user (transitional/never-reset state, same fail-open stance as getSessionRole_)', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');

  expect(isSessionValidFor_(cache, 'tok1')).toBe(true);
});

test('returns true when the session exists and the recorded session version matches the current revocation marker (session created with the current password)', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');
  cache.put(SESSION_VERSION_PREFIX + 'tok1', 'v1');
  cache.put(CREDENTIAL_REVOCATION_PREFIX + 'alice01', 'v1');

  expect(isSessionValidFor_(cache, 'tok1')).toBe(true);
});

test('returns false when the session was created before a password reset (session version no longer matches the revocation marker)', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');
  cache.put(SESSION_VERSION_PREFIX + 'tok1', 'v1'); // 這個 token 核發當下的版本
  cache.put(CREDENTIAL_REVOCATION_PREFIX + 'alice01', 'v2'); // 之後密碼被重設，換了新版本

  expect(isSessionValidFor_(cache, 'tok1')).toBe(false);
});

test('returns true when the revocation marker itself has expired/is missing, even though a session version was recorded (fail-open, same transitional stance)', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');
  cache.put(SESSION_VERSION_PREFIX + 'tok1', 'v1');
  // 沒有寫入 CREDENTIAL_REVOCATION_PREFIX + 'alice01'，模擬標記已經過期或從未被重設過

  expect(isSessionValidFor_(cache, 'tok1')).toBe(true);
});

test('is unaffected by a different user\'s revocation marker', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');
  cache.put(SESSION_VERSION_PREFIX + 'tok1', 'v1');
  cache.put(CREDENTIAL_REVOCATION_PREFIX + 'alice01', 'v1');
  cache.put(CREDENTIAL_REVOCATION_PREFIX + 'bob02', 'some-other-version'); // 別人被重設密碼，不該影響 alice01

  expect(isSessionValidFor_(cache, 'tok1')).toBe(true);
});
