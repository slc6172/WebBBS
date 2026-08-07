const { deleteArticle } = require('../src/deleteArticle');
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

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('deleteArticle removes the article and cascades to delete all its replies, leaving unrelated rows intact', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a2' }); // unrelated, should survive
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2', articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r3', articleId: 'a2' }); // unrelated, should survive
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'alice01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2); // header + a2
  expect(ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('a2');
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // header + r3
  expect(ss.getSheetByName('Replies').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('r3');
});

test('deleteArticle rejects a non-owner and deletes nothing', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1' });
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'mallory99', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteArticle rejects deleting a nonexistent article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'alice01', 'does-not-exist');

  expect(result).toEqual({ success: false, error: '文章不存在' });
});

test('deleteArticle allows a non-owner to delete when isAdmin is true', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'admin01', 'a1', true);

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});
