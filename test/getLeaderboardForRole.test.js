const { getLeaderboardForRole_: getLeaderboardForRole } = require('../src/leaderboard');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedUser(ss, overrides) {
  var defaults = {
    userId: 'alice01', passwordHash: 'h', salt: 's', role: 'user',
    createdAt: "'2026/07/01 00:00:00", loginCount: 10, lastLoginAt: '', articleCount: 3, replyCount: 5
  };
  var u = Object.assign({}, defaults, overrides);
  ss.getSheetByName('Users').appendRow([u.userId, u.passwordHash, u.salt, u.role, u.createdAt, u.loginCount, u.lastLoginAt, u.articleCount, u.replyCount]);
}

test('getLeaderboardForRole returns the real leaderboard when role has the leaderboard permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUser(ss, { userId: 'alice01', loginCount: 10 });

  const result = getLeaderboardForRole(ss, 'user');

  expect(result.loginCount).toEqual([{ userId: 'alice01', value: 10 }]);
});

test('getLeaderboardForRole returns empty arrays for newbie', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUser(ss, { userId: 'alice01', loginCount: 10 });

  expect(getLeaderboardForRole(ss, 'newbie')).toEqual({ loginCount: [], articleCount: [], replyCount: [] });
});

test('getLeaderboardForRole returns empty arrays when not logged in (null role)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUser(ss, { userId: 'alice01', loginCount: 10 });

  expect(getLeaderboardForRole(ss, null)).toEqual({ loginCount: [], articleCount: [], replyCount: [] });
});

test('getLeaderboardForRole reads the gate from the Permission sheet, not a hardcoded role list — a brand-new custom role with leaderboard=true works with no code changes', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUser(ss, { userId: 'alice01', loginCount: 10 });
  ss.getSheetByName('Permission').appendRow(
    ['moderator', true, false, false, true, false, false, true, true]
  );

  const result = getLeaderboardForRole(ss, 'moderator');

  expect(result.loginCount).toEqual([{ userId: 'alice01', value: 10 }]);
});

test('getLeaderboardForRole is unaffected by Boards.AllowRoles — leaderboard has no board scope', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUser(ss, { userId: 'alice01', loginCount: 10 });
  // No board seeded at all — if this leaked into a board-scoped check it would break.

  const result = getLeaderboardForRole(ss, 'user');

  expect(result.loginCount).toEqual([{ userId: 'alice01', value: 10 }]);
});
