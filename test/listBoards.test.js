const { listBoards } = require('../src/boards');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedBoards(ss, rows) {
  ensureSchema(ss);
  var sheet = ss.getSheetByName('Boards');
  rows.forEach(function (r) { sheet.appendRow(r); });
}

test('listBoards returns all boards sorted by sortOrder ascending', () => {
  const ss = createFakeSpreadsheet();
  seedBoards(ss, [
    ['movie', '電影板', '討論電影', 2],
    ['gossip', '八卦板', '閒聊', 1]
  ]);

  expect(listBoards(ss)).toEqual([
    { boardId: 'gossip', boardName: '八卦板', description: '閒聊', sortOrder: 1, latestArticleAt: '', latestReplyAt: '' },
    { boardId: 'movie', boardName: '電影板', description: '討論電影', sortOrder: 2, latestArticleAt: '', latestReplyAt: '' }
  ]);
});

test('listBoards returns latestArticleAt/latestReplyAt when populated (看板新內容提示功能)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  ss.getSheetByName('Boards').appendRow(['gossip', '八卦板', '閒聊', 1, "'2026/08/05 10:00:00", "'2026/08/06 15:30:00"]);

  expect(listBoards(ss)).toEqual([
    { boardId: 'gossip', boardName: '八卦板', description: '閒聊', sortOrder: 1, latestArticleAt: '2026/08/05 10:00:00', latestReplyAt: '2026/08/06 15:30:00' }
  ]);
});

test('listBoards returns an empty array when there are no boards yet', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(listBoards(ss)).toEqual([]);
});
