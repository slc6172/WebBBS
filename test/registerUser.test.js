const { registerUser_: registerUser } = require('../src/register');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

function makeInput(overrides) {
  // mycr 第 15 輪票 02：密碼最短長度提高到 8 碼並加入常見弱密碼黑名單
  // 後，原本的 fixture 密碼 'password123' 剛好命中黑名單——這支測試檔
  // 本身測的是「寫入列的機制」，不是密碼政策，換一個不在黑名單內、長度
  // 仍然合格的密碼即可，不影響這個檔案原本要驗證的行為。
  return Object.assign({
    userId: 'alice01',
    password: 'correct-horse-battery-staple',
    salt: 'fixed-salt-for-test',
    createdAt: '2026/07/30 12:00:00'
  }, overrides);
}

test('registerUser writes a new row to Users with role locked to newbie', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = registerUser(ss, lock, fakeDigest, makeInput());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 5).getValues()[0];
  expect(row[0]).toBe('alice01'); // userId
  expect(row[3]).toBe('newbie'); // role
});

test('registerUser force-escapes createdAt to plain text, since it always looks like a date', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  registerUser(ss, lock, fakeDigest, makeInput({ createdAt: '2026/07/30 12:00:00' }));

  const rawRow = ss.getSheetByName('Users').getRange(2, 1, 1, 5).getRawValues()[0];
  expect(rawRow[4]).toBe("'2026/07/30 12:00:00");
});

test('registerUser rejects an invalid userId and does not write any row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = registerUser(ss, lock, fakeDigest, makeInput({ userId: 'ab' }));

  expect(result).toEqual({ success: false, error: 'userId 長度需為 4~20 字元' });
  expect(ss.getSheetByName('Users').getLastRow()).toBe(1); // header only
});

test('registerUser rejects a duplicate userId and does not create a second row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  registerUser(ss, lock, fakeDigest, makeInput({ userId: 'bob02' }));

  const result = registerUser(ss, lock, fakeDigest, makeInput({ userId: 'bob02', password: 'different1' }));

  expect(result).toEqual({ success: false, error: 'userId 已被使用' });
  expect(ss.getSheetByName('Users').getLastRow()).toBe(2); // header + the first registration only
});
