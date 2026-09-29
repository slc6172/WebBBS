const { getBoardsForRole_: getBoardsForRole } = require('../src/boards');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedBoards(ss, rows) {
  ensureSchema(ss);
  var sheet = ss.getSheetByName('Boards');
  rows.forEach(function (r) { sheet.appendRow(r); });
}

test('getBoardsForRole returns the board when the role has global read permission AND the board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  expect(getBoardsForRole(ss, 'user').map(b => b.boardId)).toEqual(['gossip']);
});

test('getBoardsForRole returns an empty array for newbie (no global read permission), regardless of AllowRoles', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  expect(getBoardsForRole(ss, 'newbie')).toEqual([]);
});

test('getBoardsForRole returns an empty array when not logged in (null role)', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  expect(getBoardsForRole(ss, null)).toEqual([]);
});

test('getBoardsForRole omits a board whose AllowRoles excludes the role, even though the role has global read permission', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [
    ['gossip', '八卦板', '閒聊', 1, '', '', 'admin'],
    ['movie', '電影板', '討論電影', 2, '', '', 'ALL']
  ]);

  expect(getBoardsForRole(ss, 'user').map(b => b.boardId)).toEqual(['movie']);
});

test('getBoardsForRole never filters admin by AllowRoles, even when AllowRoles is blank', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [
    ['gossip', '八卦板', '閒聊', 1, '', '', ''],
    ['movie', '電影板', '討論電影', 2, '', '', 'user']
  ]);

  expect(getBoardsForRole(ss, 'admin').map(b => b.boardId).sort()).toEqual(['gossip', 'movie']);
});

test('getBoardsForRole reads the global gate from the Permission sheet, not a hardcoded role list — a brand-new custom role with articleRead=true works with no code changes', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);
  // Simulate an admin adding a custom "moderator" role directly in the Permission sheet.
  ss.getSheetByName('Permission').appendRow(
    ['moderator', true, false, false, true, false, false, false, true]
  );

  expect(getBoardsForRole(ss, 'moderator').map(b => b.boardId)).toEqual(['gossip']);
});
