const { getLeaderboard } = require('../src/leaderboard');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedUser(sheet, overrides) {
  var defaults = {
    userId: 'user', passwordHash: 'h', salt: 's', role: 'user', createdAt: '2026/07/01 00:00:00',
    loginCount: 0, lastLoginAt: '', articleCount: 0, replyCount: 0
  };
  var u = Object.assign({}, defaults, overrides);
  sheet.appendRow([u.userId, u.passwordHash, u.salt, u.role, "'" + u.createdAt, u.loginCount, u.lastLoginAt ? "'" + u.lastLoginAt : '', u.articleCount, u.replyCount]);
}

test('getLeaderboard returns empty lists when there are no users', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = getLeaderboard(ss.getSheetByName('Users'));

  expect(result).toEqual({ loginCount: [], articleCount: [], replyCount: [] });
});

test('getLeaderboard ranks the top 3 distinct scores per category, highest first', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  seedUser(sheet, { userId: 'alice', loginCount: 10, articleCount: 5, replyCount: 1 });
  seedUser(sheet, { userId: 'bob', loginCount: 7, articleCount: 3, replyCount: 8 });
  seedUser(sheet, { userId: 'carol', loginCount: 4, articleCount: 1, replyCount: 2 });
  seedUser(sheet, { userId: 'dave', loginCount: 1, articleCount: 0, replyCount: 0 });

  const result = getLeaderboard(sheet);

  expect(result.loginCount).toEqual([
    { userId: 'alice', value: 10 },
    { userId: 'bob', value: 7 },
    { userId: 'carol', value: 4 }
  ]);
  expect(result.articleCount).toEqual([
    { userId: 'alice', value: 5 },
    { userId: 'bob', value: 3 },
    { userId: 'carol', value: 1 }
  ]);
  expect(result.replyCount).toEqual([
    { userId: 'bob', value: 8 },
    { userId: 'carol', value: 2 },
    { userId: 'alice', value: 1 }
  ]);
});

test('getLeaderboard lists every tied user for a rank, even if that pushes the list past 3 entries', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  seedUser(sheet, { userId: 'alice', articleCount: 10 });
  seedUser(sheet, { userId: 'bob', articleCount: 5 });
  seedUser(sheet, { userId: 'carol', articleCount: 5 }); // ties with bob for 2nd place
  seedUser(sheet, { userId: 'dave', articleCount: 5 });  // also ties for 2nd place
  seedUser(sheet, { userId: 'erin', articleCount: 1 });  // 3rd distinct value, still included

  const result = getLeaderboard(sheet);

  expect(result.articleCount).toEqual([
    { userId: 'alice', value: 10 },
    { userId: 'bob', value: 5 },
    { userId: 'carol', value: 5 },
    { userId: 'dave', value: 5 },
    { userId: 'erin', value: 1 }
  ]);
});

test('getLeaderboard excludes users with a score of 0 from that category — 0 is not an achievement worth ranking', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  seedUser(sheet, { userId: 'alice', articleCount: 2 });
  seedUser(sheet, { userId: 'bob', articleCount: 0 });
  seedUser(sheet, { userId: 'carol', articleCount: 0 });

  const result = getLeaderboard(sheet);

  expect(result.articleCount).toEqual([{ userId: 'alice', value: 2 }]);
});

test('getLeaderboard returns an empty list for a category when every user is at 0', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Users');
  seedUser(sheet, { userId: 'alice', replyCount: 0 });
  seedUser(sheet, { userId: 'bob', replyCount: 0 });

  const result = getLeaderboard(sheet);

  expect(result.replyCount).toEqual([]);
});

test('getLeaderboard treats a blank (never-set) stat cell the same as 0', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  // appendRow with only 5 values leaves loginCount/articleCount/replyCount blank
  ss.getSheetByName('Users').appendRow(['fresh01', 'h', 's', 'user', "'2026/08/01 00:00:00"]);
  ss.getSheetByName('Users').appendRow(['alice', 'h', 's', 'user', "'2026/08/01 00:00:00", 3, '', 1, 1]);

  const result = getLeaderboard(ss.getSheetByName('Users'));

  expect(result.loginCount).toEqual([{ userId: 'alice', value: 3 }]);
  expect(result.articleCount).toEqual([{ userId: 'alice', value: 1 }]);
});
