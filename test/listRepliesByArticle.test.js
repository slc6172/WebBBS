const { listRepliesByArticle } = require('../src/articleDetail');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedReply(sheet, overrides) {
  var defaults = {
    replyId: 'r1',
    articleId: 'a1',
    author: 'bob02',
    content: '推!',
    createdAt: '2026/07/30 12:00:00'
  };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('listRepliesByArticle returns only replies for the given article, oldest first', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const sheet = ss.getSheetByName('Replies');
  seedReply(sheet, { replyId: 'r1', articleId: 'a1', content: '晚一點的回覆', createdAt: '2026/07/30 15:00:00' });
  seedReply(sheet, { replyId: 'r2', articleId: 'a1', content: '早一點的回覆', createdAt: '2026/07/30 09:00:00' });
  seedReply(sheet, { replyId: 'r3', articleId: 'a2', content: '別篇文章的回覆', createdAt: '2026/07/30 10:00:00' });

  expect(listRepliesByArticle(ss, 'a1')).toEqual([
    { replyId: 'r2', articleId: 'a1', author: 'bob02', content: '早一點的回覆', createdAt: '2026/07/30 09:00:00' },
    { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '晚一點的回覆', createdAt: '2026/07/30 15:00:00' }
  ]);
});

test('listRepliesByArticle returns an empty array when the article has no replies', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(listRepliesByArticle(ss, 'a1')).toEqual([]);
});
