const { createReplyForRole } = require('../src/postReply');
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

test('createReplyForRole writes the reply when role passes the gate', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'user', makeInput());

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('createReplyForRole rejects newbie and writes no row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'newbie', makeInput());

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});
