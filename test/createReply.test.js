const { createReply } = require('../src/postReply');
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

function makeInput(overrides) {
  return Object.assign({
    replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00'
  }, overrides);
}

test('createReply writes a new row to Replies and increments the article replyCount, within the same lock', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReply(ss, lock, makeInput());

  expect(result).toEqual({ success: true });
  const replyRow = ss.getSheetByName('Replies').getRange(2, 1, 1, 5).getValues()[0];
  expect(replyRow).toEqual(['r1', 'a1', 'bob02', '推!', '2026/07/30 13:00:00']);
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(1);
});

test('createReply escapes content starting with a formula-triggering character', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  createReply(ss, lock, makeInput({ content: '=1+1' }));

  const rawReplyRow = ss.getSheetByName('Replies').getRange(2, 1, 1, 5).getRawValues()[0];
  expect(rawReplyRow[3]).toBe("'=1+1");
});

test('createReply force-escapes createdAt to plain text, since it always looks like a date', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  createReply(ss, lock, makeInput({ createdAt: '2026/07/30 13:00:00' }));

  const rawReplyRow = ss.getSheetByName('Replies').getRange(2, 1, 1, 5).getRawValues()[0];
  expect(rawReplyRow[4]).toBe("'2026/07/30 13:00:00");
});

test('createReply rejects invalid (empty) content and neither writes a row nor increments the count', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReply(ss, lock, makeInput({ content: '' }));

  expect(result).toEqual({ success: false, error: '內文不能為空' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
  const replyCount = ss.getSheetByName('Articles').getRange(2, 9, 1, 1).getValues()[0][0];
  expect(replyCount).toBe(0);
});

test('createReply rejects a reply to a nonexistent article and does not write any row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = createReply(ss, lock, makeInput({ articleId: 'does-not-exist' }));

  expect(result).toEqual({ success: false, error: '文章不存在' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});
