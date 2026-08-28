const { deleteArticle } = require('../src/deleteArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeDrive } = require('./doubles/fakeDrive');
const { createFakeProperties } = require('./doubles/fakeProperties');
const { saveArticleImage } = require('../src/imageStorage');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0,
    imageUrls: []
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, JSON.stringify(a.imageUrls)]);
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

test('deleteArticle deletes the article\'s Drive images too, not just the Sheets row (optimization ticket 10)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const img1 = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const img2 = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', imageUrls: [img1.url, img2.url] });
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1', false, drive);

  expect(drive._files[img1.fileId]).toBeUndefined();
  expect(drive._files[img2.fileId]).toBeUndefined();
});

// ---- 圖片張數突破 ----

test('deleteArticle deletes all Drive images for an article with more than 3 images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const saved = ['a', 'b', 'c', 'd', 'e'].map(function (letter) {
    return saveArticleImage(drive, properties, letter, 'image/png', letter + '.png', '2026-08');
  });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', imageUrls: saved.map(function (s) { return s.url; }) });
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1', false, drive);

  saved.forEach(function (s) {
    expect(drive._files[s.fileId]).toBeUndefined();
  });
});

test('deleteArticle does not attempt any Drive calls when the article has no images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' }); // no imageUrl overrides — all blank
  const lock = createFakeLock();

  // drive intentionally omitted (undefined) — must not throw when there's nothing to delete
  expect(() => deleteArticle(ss, lock, 'alice01', 'a1')).not.toThrow();
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

test('deleteArticle decrements the article author\'s articleCount, and separately decrements each cascaded reply\'s author\'s replyCount (optimization ticket 08)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1', author: 'bob02' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2', articleId: 'a1', author: 'carol03' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r3', articleId: 'a1', author: 'bob02' }); // bob02 replied twice
  const usersSheet = ss.getSheetByName('Users');
  usersSheet.appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 3, 0]);
  usersSheet.appendRow(['bob02', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 5]);
  usersSheet.appendRow(['carol03', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 2]);
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1');

  const rows = usersSheet.getRange(2, 1, 3, 9).getValues();
  const byId = {};
  rows.forEach(r => { byId[r[0]] = { articleCount: r[7], replyCount: r[8] }; });
  expect(byId['alice01']).toEqual({ articleCount: 2, replyCount: 0 }); // article author, 3 -> 2
  expect(byId['bob02']).toEqual({ articleCount: 0, replyCount: 3 });   // replied twice, 5 -> 3
  expect(byId['carol03']).toEqual({ articleCount: 0, replyCount: 1 }); // replied once, 2 -> 1
});
