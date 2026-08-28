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

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

function makeInput(overrides) {
  return Object.assign({
    replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00'
  }, overrides);
}

test('createReplyForRole writes the reply when role has global replyPost permission AND the article\'s board AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'user', makeInput());

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('createReplyForRole rejects newbie and writes no row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'newbie', makeInput());

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('createReplyForRole rejects a role with global replyPost permission when the article\'s board AllowRoles excludes it, and writes no row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'user', makeInput());

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('createReplyForRole rejects replying to an articleId that doesn\'t exist, even for a role with global replyPost permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'user', makeInput({ articleId: 'does-not-exist' }));

  expect(result).toEqual({ success: false, error: '文章不存在' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('createReplyForRole ignores AllowRoles entirely for admin', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = createReplyForRole(ss, lock, 'admin', makeInput({ author: 'admin01' }));

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('createReplyForRole reads the Articles sheet at most once per call', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  createReplyForRole(ss, lock, 'user', makeInput());

  expect(ss.getSheetByName('Articles')._getReadCount()).toBeLessThanOrEqual(1);
});
