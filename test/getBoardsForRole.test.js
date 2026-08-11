const { getBoardsForRole } = require('../src/boards');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedBoards(ss, rows) {
  ensureSchema(ss);
  var sheet = ss.getSheetByName('Boards');
  rows.forEach(function (r) { sheet.appendRow(r); });
}

test('getBoardsForRole returns the board list when role passes the gate', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1]]);

  expect(getBoardsForRole(ss, 'user')).toEqual([
    { boardId: 'gossip', boardName: '八卦板', description: '閒聊', sortOrder: 1, latestArticleAt: '', latestReplyAt: '' }
  ]);
});

test('getBoardsForRole returns an empty array for newbie', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1]]);

  expect(getBoardsForRole(ss, 'newbie')).toEqual([]);
});

test('getBoardsForRole returns an empty array when not logged in (null role)', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [['gossip', '八卦板', '閒聊', 1]]);

  expect(getBoardsForRole(ss, null)).toEqual([]);
});
