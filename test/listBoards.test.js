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
    { boardId: 'gossip', boardName: '八卦板', description: '閒聊', sortOrder: 1 },
    { boardId: 'movie', boardName: '電影板', description: '討論電影', sortOrder: 2 }
  ]);
});

test('listBoards returns an empty array when there are no boards yet', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(listBoards(ss)).toEqual([]);
});
