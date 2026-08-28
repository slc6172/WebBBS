const { boardAllowsRoleById } = require('../src/boards');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedBoards(ss, rows) {
  ensureSchema(ss);
  var sheet = ss.getSheetByName('Boards');
  rows.forEach(function (r) { sheet.appendRow(r); });
}

test('boardAllowsRoleById allows a role listed in that board\'s AllowRoles', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'user,admin']]);

  expect(boardAllowsRoleById(ss, 'gossip', 'user')).toBe(true);
});

test('boardAllowsRoleById denies a role not listed in that board\'s AllowRoles', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'admin']]);

  expect(boardAllowsRoleById(ss, 'gossip', 'user')).toBe(false);
});

test('boardAllowsRoleById always allows admin, even when AllowRoles is blank or excludes admin', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [
    ['gossip', '八卦板', '閒聊', 1, '', '', ''],
    ['movie', '電影板', '討論電影', 2, '', '', 'user']
  ]);

  expect(boardAllowsRoleById(ss, 'gossip', 'admin')).toBe(true);
  expect(boardAllowsRoleById(ss, 'movie', 'admin')).toBe(true);
});

test('boardAllowsRoleById denies everyone (except admin) when the boardId does not match any existing board', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']]);

  expect(boardAllowsRoleById(ss, 'not-a-real-board', 'user')).toBe(false);
  expect(boardAllowsRoleById(ss, 'not-a-real-board', 'admin')).toBe(true);
});
