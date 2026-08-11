const { incrementUserStat } = require('../src/userStats');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedUserRow(sheet, overrides) {
  var defaults = {
    userId: 'alice01', passwordHash: 'h', salt: 's', role: 'user', createdAt: '2026/07/01 00:00:00',
    loginCount: 3, lastLoginAt: '2026/08/01 09:00:00', articleCount: 2, replyCount: 5
  };
  var u = Object.assign({}, defaults, overrides);
  sheet.appendRow([u.userId, u.passwordHash, u.salt, u.role, "'" + u.createdAt, u.loginCount, "'" + u.lastLoginAt, u.articleCount, u.replyCount]);
}

test('incrementUserStat adds a positive delta to the given user\'s articleCount', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'articleCount', 1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(3);
});

test('incrementUserStat applies a negative delta to replyCount', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', replyCount: 5 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'replyCount', -1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[8]).toBe(4);
});

test('incrementUserStat only touches the matching user\'s row, leaving others untouched', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });
  seedUserRow(ss.getSheetByName('Users'), { userId: 'bob02', articleCount: 9 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'articleCount', 1);

  const rows = ss.getSheetByName('Users').getRange(2, 1, 2, 9).getValues();
  expect(rows[0][7]).toBe(3); // alice01
  expect(rows[1][7]).toBe(9); // bob02 untouched
});

test('incrementUserStat treats a blank/never-set cell as 0 before applying the delta', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  // appendRow with only 5 values leaves articleCount/replyCount blank, same as a
  // freshly-registered user who has never posted
  ss.getSheetByName('Users').appendRow(['carol03', 'h', 's', 'user', "'" + '2026/08/01 00:00:00']);

  incrementUserStat(ss.getSheetByName('Users'), 'carol03', 'articleCount', 1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(1);
});

test('incrementUserStat silently does nothing when the userId does not exist', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });

  expect(() => incrementUserStat(ss.getSheetByName('Users'), 'nobody', 'articleCount', 1)).not.toThrow();

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(2); // alice01 unaffected
});
