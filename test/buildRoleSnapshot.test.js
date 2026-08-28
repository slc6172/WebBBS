const { buildRoleSnapshot } = require('../src/boards');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedBoards(ss, rows) {
  ensureSchema(ss);
  var sheet = ss.getSheetByName('Boards');
  rows.forEach(function (r) { sheet.appendRow(r); });
}

test('buildRoleSnapshot returns the role\'s permissions and the boardIds it can read', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  const snapshot = buildRoleSnapshot(ss, 'user');

  expect(snapshot.permissions.articleRead).toBe(true);
  expect(snapshot.allowedBoardIds).toEqual(['gossip']);
});

test('buildRoleSnapshot returns an empty allowedBoardIds for a role without global articleRead, regardless of AllowRoles', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  const snapshot = buildRoleSnapshot(ss, 'newbie');

  expect(snapshot.permissions.articleRead).toBe(false);
  expect(snapshot.allowedBoardIds).toEqual([]);
});

test('buildRoleSnapshot fails safe for a null role (not logged in): all permissions false, no boards', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  const snapshot = buildRoleSnapshot(ss, null);

  expect(snapshot.permissions.articleRead).toBe(false);
  expect(snapshot.allowedBoardIds).toEqual([]);
});

test('buildRoleSnapshot includes every boardId for admin, ignoring AllowRoles entirely', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [
    ['gossip', '八卦板', '閒聊', 1, '', '', ''],
    ['movie', '電影板', '討論電影', 2, '', '', 'user']
  ]);

  const snapshot = buildRoleSnapshot(ss, 'admin');

  expect(snapshot.allowedBoardIds.sort()).toEqual(['gossip', 'movie']);
});
