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

test('deleteReply removes the reply row and decrements the article replyCount, within the same lock, when the requester owns the reply', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', author: 'bob02' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2' }); // should survive
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'bob02', 'a1', 'r1', false);

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // header + r2
  expect(ss.getSheetByName('Replies').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('r2');
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(1);
});

test('deleteReply decrements the reply author\'s replyCount in Users (optimization ticket 08)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', author: 'bob02' });
  ss.getSheetByName('Users').appendRow(['bob02', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 5]);
  const lock = createFakeLock();

  deleteReply(ss, lock, 'bob02', 'a1', 'r1', false);

  const userRow = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(userRow[8]).toBe(4); // replyCount 5 -> 4
});

test('deleteReply rejects deleting a nonexistent reply and leaves replyCount unchanged', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { replyCount: 0 });
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'bob02', 'a1', 'does-not-exist', false);

  expect(result).toEqual({ success: false, error: '回覆不存在' });
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(0);
});

test('deleteReply rejects a non-admin requester who does not own the reply, and leaves it untouched', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'carol03', 'a1', 'r1', false);

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteReply lets an admin (isAdmin=true) delete a reply they don\'t own', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'admin01', 'a1', 'r1', true);

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('deleteReply reads the Articles sheet at most once per call', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', author: 'bob02' });
  const lock = createFakeLock();

  deleteReply(ss, lock, 'bob02', 'a1', 'r1', false);

  expect(ss.getSheetByName('Articles')._getReadCount()).toBeLessThanOrEqual(1);
});

// 安全性審查 H2 回歸測試：見 gas-bbs-perf-round-review.md H2。修復前，
// 傳入一個跟這則回覆實際所屬文章不同的 articleId，會讓
// replyCount 被錯誤地扣在傳入的那個(不相干的)文章上，而不是真正
// 少了一則回覆的文章。
test('deleteReply rejects when the supplied articleId does not match the reply\'s real parent article, and touches nothing', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', replyCount: 2 });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a2', replyCount: 5 });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a2', author: 'bob02' });
  const lock = createFakeLock();

  // r1 真正屬於 a2，卻宣稱屬於 a1。
  const result = deleteReply(ss, lock, 'bob02', 'a1', 'r1', false);

  expect(result).toEqual({ success: false, error: '回覆與文章不符' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // 回覆沒被刪
  const a1ReplyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  const a2ReplyCount = ss.getSheetByName('Articles').getRange(3, 9, 1, 1).getValues()[0][0];
  expect(a1ReplyCount).toBe(2); // 沒被誤扣
  expect(a2ReplyCount).toBe(5); // 真正的文章也沒被動到（因為請求整個被拒絕）
});

test('deleteReply rejects an articleId/replyId mismatch even for an admin requester', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', replyCount: 2 });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a2', replyCount: 5 });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a2', author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReply(ss, lock, 'admin01', 'a1', 'r1', true);

  expect(result).toEqual({ success: false, error: '回覆與文章不符' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});
