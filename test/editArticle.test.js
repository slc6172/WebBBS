const { editArticle } = require('../src/editArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '原標題', author: 'alice01',
    content: '原內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function makeUpdates(overrides) {
  return Object.assign({
    title: '新標題',
    content: '新內文',
    editedAt: '2026/07/30 18:00:00'
  }, overrides);
}

test('editArticle updates title/content/editedAt/editedBy when the requester is the owner', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('新標題');
  expect(row[4]).toBe('新內文');
  expect(row[6]).toBe('2026/07/30 18:00:00');
  expect(row[7]).toBe('alice01');
});

test('editArticle force-escapes editedAt to plain text, since it always looks like a date', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, 'alice01', 'a1', makeUpdates({ editedAt: '2026/07/30 18:00:00' }));

  const rawRow = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getRawValues()[0];
  expect(rawRow[6]).toBe("'2026/07/30 18:00:00");
});

test('editArticle rejects a non-owner and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, 'mallory99', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
  expect(row[6]).toBe('');
});

test('editArticle rejects editing a nonexistent article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = editArticle(ss, 'alice01', 'does-not-exist', makeUpdates());

  expect(result).toEqual({ success: false, error: '文章不存在' });
});

test('editArticle rejects an invalid title and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, 'alice01', 'a1', makeUpdates({ title: '' }));

  expect(result).toEqual({ success: false, error: '標題不能為空' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
});

test('editArticle allows a non-owner to edit when isAdmin is true, recording editedBy as the admin', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  const result = editArticle(ss, 'admin01', 'a1', makeUpdates(), true);

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('新標題');
  expect(row[7]).toBe('admin01');
});
