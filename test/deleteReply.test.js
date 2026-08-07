const { deleteReply } = require('../src/deleteReply');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 2
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('deleteReply removes the reply row and decrements the article replyCount, within the same lock', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2' }); // should survive
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'a1', 'r1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // header + r2
  expect(ss.getSheetByName('Replies').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('r2');
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(1);
});

test('deleteReply rejects deleting a nonexistent reply and leaves replyCount unchanged', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { replyCount: 0 });
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'a1', 'does-not-exist');

  expect(result).toEqual({ success: false, error: '回覆不存在' });
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(0);
});
