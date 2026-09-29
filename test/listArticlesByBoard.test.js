const { listArticlesByBoard } = require('../src/articles');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1',
    boardId: 'gossip',
    title: 't',
    author: 'alice',
    content: 'body',
    createdAt: '2026/07/30 12:00:00',
    editedAt: '',
    editedBy: '',
    replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

test('listArticlesByBoard returns only articles for the given board, newest first, without the content field', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Articles');
  seedArticle(sheet, { articleId: 'a1', boardId: 'gossip', title: '舊文', createdAt: '2026/07/30 09:00:00' });
  seedArticle(sheet, { articleId: 'a2', boardId: 'gossip', title: '新文', createdAt: '2026/07/30 15:00:00' });
  seedArticle(sheet, { articleId: 'a3', boardId: 'movie', title: '別板文章', createdAt: '2026/07/30 20:00:00' });

  const result = listArticlesByBoard(ss, 'gossip');

  expect(result).toEqual([
    { articleId: 'a2', boardId: 'gossip', title: '新文', author: 'alice', createdAt: '2026/07/30 15:00:00', replyCount: 0 },
    { articleId: 'a1', boardId: 'gossip', title: '舊文', author: 'alice', createdAt: '2026/07/30 09:00:00', replyCount: 0 }
  ]);
});

test('listArticlesByBoard includes each article\'s current replyCount', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Articles');
  seedArticle(sheet, { articleId: 'a1', boardId: 'gossip', replyCount: 3 });

  const result = listArticlesByBoard(ss, 'gossip');

  expect(result[0].replyCount).toBe(3);
});

test('listArticlesByBoard returns an empty array when the board has no articles yet', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(listArticlesByBoard(ss, 'gossip')).toEqual([]);
});

// mycr 第 15 輪票 05（見 F-15）：修法前既有的列，如果標題剛好長得像
// 數字/日期/時間/布林值，可能已經被 Sheets 自動轉成對應型別，不再是
// 字串——這裡不是用票 05 的寫入路徑去寫（那條路徑寫入時已經加了防轉換
// 前綴），是直接用一個非字串值模擬「修法前就已經被轉換過」的既有資料，
// 確認讀取路徑對這種舊資料仍然寬容，回傳的是字串。
test('listArticlesByBoard coerces a non-string title (from a pre-fix row that Sheets already auto-converted) to a string instead of returning the raw Date/Number/Boolean value', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Articles');
  seedArticle(sheet, { articleId: 'a1', title: 12345 });

  const result = listArticlesByBoard(ss, 'gossip');

  expect(result[0].title).toBe('12345');
  expect(typeof result[0].title).toBe('string');
});
