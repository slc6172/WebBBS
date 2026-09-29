const { login_: login, getUserRecord_ } = require('../src/login');
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

test('login succeeds with correct credentials and returns a token', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result.success).toBe(true);
  expect(result.token).toBe('fixed-token-123');
});

// mycr 第 15 輪票 03（見 F-16）：對格式不合法的 userId（含任意訪客隨手
// 打的字串，不一定對應任何真實帳號）連續觸發登入失敗時，不應該建立
// 對應的鎖定快取 key，也不該寫入 AuditLog——這兩者都是有限資源，格式
// 不合法的輸入不需要真的走到「查表、比對密碼」這一步才能判斷該拒絕。
describe('格式不合法的 userId 在碰快取/稽核之前就被拒絕', () => {
  test.each([
    'ab',                     // 太短（< 4 碼）
    'a'.repeat(21),           // 太長（> 20 碼）
    'has spaces here',        // 不合法字元（含空白）
    "'; DROP TABLE Users; --" // 不合法字元，順便是一個公式/注入外觀的字串
  ])('格式不合法的 userId 不建立鎖定快取 key：%s', (badUserId) => {
    const ss = createFakeSpreadsheet();
    seedUser(ss);
    const cache = createFakeCache();

    const result = login(ss, cache, function () { return 'token'; }, fakeDigest, '2026/08/05 09:00:00', {
      userId: badUserId,
      password: 'anything'
    });

    expect(result).toEqual({ success: false, error: 'userId 或密碼錯誤' });
    expect(cache.get('loginFail_' + badUserId)).toBeNull();
  });

  test('格式不合法的 userId 連續失敗多次，也不會寫入 AuditLog', () => {
    const ss = createFakeSpreadsheet();
    seedUser(ss);
    const cache = createFakeCache();
    const badUserId = 'x'; // 太短

    for (let i = 0; i < 10; i++) {
      login(ss, cache, function () { return 'token'; }, fakeDigest, '2026/08/05 09:00:00', {
        userId: badUserId,
        password: 'anything'
      });
    }

    expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(1); // 只剩表頭，沒有新增任何列
  });

  test('格式合法但帳號不存在時，既有鎖定行為（達門檻寫入 AuditLog）不變', () => {
    const ss = createFakeSpreadsheet();
    seedUser(ss);
    const cache = createFakeCache();
    const nonexistentButWellFormed = 'ghost001';

    for (let i = 0; i < 5; i++) {
      login(ss, cache, function () { return 'token'; }, fakeDigest, '2026/08/05 09:00:00', {
        userId: nonexistentButWellFormed,
        password: 'anything'
      });
    }

    expect(cache.get('loginFail_' + nonexistentButWellFormed)).toBe('5');
    expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(2); // 表頭 + 1 筆鎖定紀錄
  });
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
    password: 'correct-horse-battery-staple'
  });

  expect(result).toEqual({ success: false, error: '帳號已被暫時鎖定,請稍後再試' });
});

test('A09: the moment lockout is triggered writes exactly one AuditLog row, not one per failed attempt', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  for (let i = 0; i < 5; i++) {
    login(ss, cache, function () { return 'token-' + i; }, fakeDigest, '2026/08/05 09:00:00', {
      userId: 'alice01',
      password: 'wrong-password'
    });
  }

  const auditSheet = ss.getSheetByName('AuditLog');
  expect(auditSheet.getLastRow()).toBe(2); // 標題列 + 剛好一筆（第 5 次才觸發，不是每次失敗都記）
  const row = auditSheet.getRange(2, 1, 1, 5).getValues()[0];
  expect(row[1]).toBe('alice01');
  expect(row[2]).toBe('LOGIN_LOCKOUT');
  expect(row[3]).toBe('alice01');
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
    password: 'correct-horse-battery-staple'
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
    password: 'correct-horse-battery-staple'
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
    password: 'correct-horse-battery-staple'
  });
  const second = login(ss, cache, function () { return 'token-b'; }, fakeDigest, '2026/08/06 10:30:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
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
    password: 'correct-horse-battery-staple'
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

// ---- pendingMentions（@提及輪 ticket 05）----

test('getUserRecord_ reads pendingMentions (column 11), defaulting to empty string when never set', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');

  expect(record.pendingMentions).toBe('');
});

test('getUserRecord_ reads a populated pendingMentions JSON blob as-is (parsing is mentions.js\'s job, not this function\'s)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  sheet.appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 0, '', '[{"articleId":"a1"}]']);

  const record = getUserRecord_(sheet, 'alice01');

  expect(record.pendingMentions).toBe('[{"articleId":"a1"}]');
});

// ---- credentialVersion（`/mycr` 深層複掃 Finding 1）----

test('getUserRecord_ reads credentialVersion (column 12), defaulting to \'1\' for a never-reset / pre-migration row', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');

  expect(record.credentialVersion).toBe('1');
});

test('getUserRecord_ reads a populated credentialVersion as-is', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 12, 1, 1).setValues([['some-uuid-after-reset']]);

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');

  expect(record.credentialVersion).toBe('some-uuid-after-reset');
});

test('a successful login stores the account\'s current credentialVersion under a cache key parallel to the session token', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 12, 1, 1).setValues([['v1']]);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(cache.get('sessionVer_fixed-token-123')).toBe('v1');
});

test('a successful login for an account that has never had its password reset stores the default credentialVersion (\'1\'), not a blank/undefined value', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss); // credentialVersion column is blank — never reset
  const cache = createFakeCache();

  login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(cache.get('sessionVer_fixed-token-123')).toBe('1');
});

test('a failed login does not write a session-version cache entry', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'wrong-password'
  });

  expect(cache.get('sessionVer_fixed-token-123')).toBeNull();
});

// ---- 登入權限（權限系統 ticket 09）----

test('login is rejected with the exact same error as a wrong password when the role\'s login permission is false, and does not increment the failure-lockout count', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['blocked-role']]);
  ss.getSheetByName('Permission').appendRow(
    ['blocked-role', false, false, false, false, false, false, false, false]
  );
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result).toEqual({ success: false, error: 'userId 或密碼錯誤' });
  expect(cache.get('loginFail_alice01')).toBeNull();
});

test('login rejected by role permission does not write loginCount/lastLoginAt or issue a token', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['blocked-role']]);
  ss.getSheetByName('Permission').appendRow(
    ['blocked-role', false, false, false, false, false, false, false, false]
  );
  const cache = createFakeCache();

  login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.loginCount).toBe(0);
  expect(record.lastLoginAt).toBe('');
});

test('login succeeds normally for newbie/user/admin, whose login permission defaults to TRUE — existing behavior unchanged', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss); // registerUser defaults to role 'newbie'
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result.success).toBe(true);
});

test('login is rejected the same way for a role that doesn\'t exist in the Permission sheet at all (e.g. a typo or a removed role) — fails safe, not open', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['not-a-real-role']]);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'fixed-token-123'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result).toEqual({ success: false, error: 'userId 或密碼錯誤' });
});

// ---- 提及登入清單顯示（@提及輪 ticket 06）----

test('a successful login returns the pending mentions that were sitting there before this login (parsed into an array, not a raw JSON string)', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 11, 1, 1).setValues([['[{"articleId":"a1","mentionedBy":"bob02"}]']]);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result.pendingMentions).toEqual([{ articleId: 'a1', mentionedBy: 'bob02' }]);
});

test('when there were no pending mentions, login returns an empty array (not null/undefined)', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result.pendingMentions).toEqual([]);
});

test('a successful login clears pendingMentions on the sheet, regardless of whether the person actually views the list', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 11, 1, 1).setValues([['[{"articleId":"a1"}]']]);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.pendingMentions).toBe('[]');
});

test('clearing pendingMentions on login does not touch lastSeenBoards, articleCount, or replyCount — only the mentions column is written', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  const sheet = ss.getSheetByName('Users');
  sheet.getRange(2, 8, 1, 3).setValues([[5, 3, '{"gossip":"2026/08/01 00:00:00"}']]); // articleCount, replyCount, lastSeenBoards
  sheet.getRange(2, 11, 1, 1).setValues([['[{"articleId":"a1"}]']]);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  const rows = sheet.getRange(2, 1, 1, 11).getValues();
  expect(rows[0][7]).toBe(5); // articleCount 沒被動到
  expect(rows[0][8]).toBe(3); // replyCount 沒被動到
  expect(rows[0][9]).toBe('{"gossip":"2026/08/01 00:00:00"}'); // lastSeenBoards 沒被動到
});

test('a failed login does not clear pendingMentions', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 11, 1, 1).setValues([['[{"articleId":"a1"}]']]);
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'wrong-password'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.pendingMentions).toBe('[{"articleId":"a1"}]');
});

test('a login rejected by role permission does not clear pendingMentions', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['blocked-role']]);
  ss.getSheetByName('Users').getRange(2, 11, 1, 1).setValues([['[{"articleId":"a1"}]']]);
  ss.getSheetByName('Permission').appendRow(
    ['blocked-role', false, false, false, false, false, false, false, false]
  );
  const cache = createFakeCache();

  login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  const record = getUserRecord_(ss.getSheetByName('Users'), 'alice01');
  expect(record.pendingMentions).toBe('[{"articleId":"a1"}]');
});

test('a malformed pendingMentions value on the sheet is treated as no mentions, not a crash', () => {
  const ss = createFakeSpreadsheet();
  seedUser(ss);
  ss.getSheetByName('Users').getRange(2, 11, 1, 1).setValues([['not valid json']]);
  const cache = createFakeCache();

  const result = login(ss, cache, function () { return 'token-a'; }, fakeDigest, '2026/08/05 09:00:00', {
    userId: 'alice01',
    password: 'correct-horse-battery-staple'
  });

  expect(result.success).toBe(true);
  expect(result.pendingMentions).toEqual([]);
});
