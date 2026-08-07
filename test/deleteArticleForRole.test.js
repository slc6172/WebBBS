const { deleteArticleForRole } = require('../src/deleteArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

test('deleteArticleForRole deletes the article when role passes the gate and the requester owns it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'user', 'alice01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('deleteArticleForRole rejects newbie and deletes nothing, even for the article owner', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'newbie', 'alice01', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});

test('deleteArticleForRole lets an admin delete someone else\'s article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'admin', 'admin01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});
