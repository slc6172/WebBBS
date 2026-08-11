const { getArticleDetailForRole } = require('../src/articleDetail');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('getArticleDetailForRole returns the article and its replies when role passes the gate', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});

  const result = getArticleDetailForRole(ss, 'user', 'a1');

  expect(result.article).toEqual({
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01', content: '內文', createdAt: '2026/07/30 12:00:00',
    editedAt: '', editedBy: '', imageUrl1: '', imageUrl2: '', imageUrl3: ''
  });
  expect(result.replies).toEqual([
    { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' }
  ]);
});

test('getArticleDetailForRole returns null article and empty replies for newbie', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  expect(getArticleDetailForRole(ss, 'newbie', 'a1')).toEqual({ article: null, replies: [] });
});

test('getArticleDetailForRole returns null article and empty replies when the article does not exist', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(getArticleDetailForRole(ss, 'user', 'does-not-exist')).toEqual({ article: null, replies: [] });
});
