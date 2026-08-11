const { editArticle } = require('../src/editArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeDrive } = require('./doubles/fakeDrive');
const { createFakeProperties } = require('./doubles/fakeProperties');
const { saveArticleImage } = require('../src/imageStorage');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '原標題', author: 'alice01',
    content: '原內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0,
    imageUrl1: '', imageUrl2: '', imageUrl3: ''
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, a.imageUrl1, a.imageUrl2, a.imageUrl3]);
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

// ---- 圖片管理（優化輪 ticket 10）----

test('editArticle writes the new imageUrls when updates.imageUrls is provided', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, 'alice01', 'a1', makeUpdates({ imageUrls: ['https://drive.example/new1', '', ''] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 12).getValues()[0];
  expect(row[9]).toBe('https://drive.example/new1');
  expect(row[10]).toBe('');
});

test('editArticle deletes the Drive file for an image that was removed', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const kept = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const removed = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrl1: kept.url, imageUrl2: removed.url });

  editArticle(ss, 'alice01', 'a1', makeUpdates({ imageUrls: [kept.url, '', ''] }), false, drive);

  expect(drive._files[removed.fileId]).toBeUndefined(); // removed image's Drive file is gone
  expect(drive._files[kept.fileId]).toBeTruthy();        // kept image's Drive file is untouched
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 12).getValues()[0];
  expect(row[9]).toBe(kept.url);
  expect(row[10]).toBe('');
});

test('editArticle deletes the Drive file for an image that was replaced by a new one', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const original = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const replacement = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrl1: original.url });

  editArticle(ss, 'alice01', 'a1', makeUpdates({ imageUrls: [replacement.url, '', ''] }), false, drive);

  expect(drive._files[original.fileId]).toBeUndefined();
  expect(drive._files[replacement.fileId]).toBeTruthy();
});

test('editArticle does not touch Drive at all when the image set is unchanged', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const original = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrl1: original.url });

  editArticle(ss, 'alice01', 'a1', makeUpdates({ imageUrls: [original.url, '', ''] }), false, drive);

  expect(drive._files[original.fileId]).toBeTruthy(); // still there, never deleted
});

test('editArticle leaves existing images untouched when updates.imageUrls is not provided at all', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { imageUrl1: 'https://drive.example/kept' });

  editArticle(ss, 'alice01', 'a1', makeUpdates()); // no imageUrls field, no drive param

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 12).getValues()[0];
  expect(row[9]).toBe('https://drive.example/kept');
});
