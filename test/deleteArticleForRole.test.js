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

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

test('deleteArticleForRole deletes the article when role has articleManageOwn, owns it, and the board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'user', 'alice01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('deleteArticleForRole rejects newbie and deletes nothing, even for the article owner', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'newbie', 'alice01', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});

test('deleteArticleForRole lets an admin delete someone else\'s article, ignoring AllowRoles entirely', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'admin', 'admin01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('deleteArticleForRole rejects a role with articleManageOwn when the article\'s board AllowRoles excludes it, and deletes nothing', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  seedArticle(ss.getSheetByName('Articles'), {});
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'user', 'alice01', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});

test('deleteArticleForRole rejects a role without articleManageOwn even though the board\'s AllowRoles would allow it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { author: 'carol03' });
  ss.getSheetByName('Permission').appendRow(
    ['post-only', true, true, false, true, true, false, false, true]
  );
  const lock = createFakeLock();

  const result = deleteArticleForRole(ss, lock, 'post-only', 'carol03', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});
