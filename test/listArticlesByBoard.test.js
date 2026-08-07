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
