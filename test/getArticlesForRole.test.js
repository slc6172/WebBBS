const { getArticlesForRole } = require('../src/articles');
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

test('getArticlesForRole returns the article list when role passes the gate', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip', title: '文章' });

  expect(getArticlesForRole(ss, 'user', 'gossip')).toEqual([
    { articleId: 'a1', boardId: 'gossip', title: '文章', author: 'alice', createdAt: '2026/07/30 12:00:00', replyCount: 0 }
  ]);
});

test('getArticlesForRole returns an empty array for newbie', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip' });

  expect(getArticlesForRole(ss, 'newbie', 'gossip')).toEqual([]);
});

test('getArticlesForRole returns an empty array when not logged in (null role)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip' });

  expect(getArticlesForRole(ss, null, 'gossip')).toEqual([]);
});
