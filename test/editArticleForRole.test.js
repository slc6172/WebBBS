const { editArticleForRole_: editArticleForRole } = require('../src/editArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '原標題', author: 'alice01',
    content: '原內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

function makeUpdates(overrides) {
  return Object.assign({ title: '新標題', content: '新內文', editedAt: '2026/07/30 18:00:00' }, overrides);
}

test('editArticleForRole edits the article when role has articleManageOwn, owns it, and the board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticleForRole(ss, lock, 'user', 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
});

test('editArticleForRole rejects newbie and makes no changes, even for the article owner', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticleForRole(ss, lock, 'newbie', 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
});

test('editArticleForRole lets an admin edit someone else\'s article, recording editedBy as the admin, ignoring AllowRoles entirely', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  const result = editArticleForRole(ss, lock, 'admin', 'admin01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe('admin01');
});

test('A09: admin editing someone else\'s article writes exactly one AuditLog row, timestamped with updates.editedAt', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  editArticleForRole(ss, lock, 'admin', 'admin01', 'a1', makeUpdates());

  const auditSheet = ss.getSheetByName('AuditLog');
  expect(auditSheet.getLastRow()).toBe(2);
  const row = auditSheet.getRange(2, 1, 1, 5).getValues()[0];
  expect(row[1]).toBe('admin01');
  expect(row[2]).toBe('ADMIN_EDIT_OTHERS_CONTENT');
  expect(row[3]).toBe('a1');
});

test('A09: admin editing their own article writes no AuditLog row (not a moderation event)', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { author: 'admin01' });

  editArticleForRole(ss, lock, 'admin', 'admin01', 'a1', makeUpdates());

  expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(1); // 只有標題列
});

test('A09: a rejected edit (validation failure) writes no AuditLog row even for admin-on-others-content', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  const result = editArticleForRole(ss, lock, 'admin', 'admin01', 'a1', makeUpdates({ title: '' })); // 空標題,驗證應該不過

  expect(result.success).toBe(false);
  expect(ss.getSheetByName('AuditLog').getLastRow()).toBe(1); // 什麼都沒真的改到,不該留紀錄
});

test('editArticleForRole rejects a role with articleManageOwn when the article\'s board AllowRoles excludes it, and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticleForRole(ss, lock, 'user', 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
});

test('editArticleForRole rejects a role without articleManageOwn even though the board\'s AllowRoles would allow it', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { author: 'carol03' });
  // Custom role: can read/post articles, but cannot manage even its own.
  ss.getSheetByName('Permission').appendRow(
    ['post-only', true, true, false, true, true, false, false, true]
  );

  const result = editArticleForRole(ss, lock, 'post-only', 'carol03', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
});

test('editArticleForRole still returns "文章不存在" for a non-admin role when the article doesn\'t exist, not a permission error', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);

  const result = editArticleForRole(ss, lock, 'user', 'alice01', 'does-not-exist', makeUpdates());

  expect(result).toEqual({ success: false, error: '文章不存在' });
});
