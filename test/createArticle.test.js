const { createArticle } = require('../src/postArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function makeInput(overrides) {
  return Object.assign({
    articleId: 'a1',
    boardId: 'gossip',
    title: '標題',
    content: '內文',
    author: 'alice01',
    createdAt: '2026/07/30 12:00:00'
  }, overrides);
}

test('createArticle writes a new row to Articles with the given fields', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = createArticle(ss, lock, makeInput());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row).toEqual(['a1', 'gossip', '標題', 'alice01', '內文', '2026/07/30 12:00:00', '', '', 0]);
});

test('createArticle escapes a title or content that starts with a formula-triggering character', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput({ title: '=SUM(A1)', content: '@mention' }));

  const rawRow = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getRawValues()[0];
  expect(rawRow[2]).toBe("'=SUM(A1)");
  expect(rawRow[4]).toBe("'@mention");
});

test('createArticle force-escapes createdAt to plain text, since it always looks like a date', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput({ createdAt: '2026/07/30 12:00:00' }));

  const rawRow = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getRawValues()[0];
  expect(rawRow[5]).toBe("'2026/07/30 12:00:00");
});

test('createArticle writes provided image URLs into the imageUrls column as a JSON array', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput({
    imageUrls: ['https://drive.example.com/file/1', 'https://drive.example.com/file/2']
  }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(['https://drive.example.com/file/1', 'https://drive.example.com/file/2']);
});

test('createArticle writes "[]" when no images were attached', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput()); // no imageUrls field at all

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(row[9]).toBe('[]');
});

// ---- 圖片張數突破：一般發文超過上限直接拒絕（不像 createArticleUnlocked_ 那樣默默截斷） ----

test('createArticle rejects a submission with more than 99 images and does not write any row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  const tooMany = [];
  for (let i = 0; i < 100; i++) {
    tooMany.push('https://drive.example.com/file/' + i);
  }

  const result = createArticle(ss, lock, makeInput({ imageUrls: tooMany }));

  expect(result).toEqual({ success: false, error: '圖片數量超過上限' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('createArticle accepts exactly 99 images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  const exactlyMax = [];
  for (let i = 0; i < 99; i++) {
    exactlyMax.push('https://drive.example.com/file/' + i);
  }

  const result = createArticle(ss, lock, makeInput({ imageUrls: exactlyMax }));

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toHaveLength(99);
});

test('createArticle increments the author\'s articleCount in Users (optimization ticket 08)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  ss.getSheetByName('Users').appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 2, 0]);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput({ author: 'alice01' }));

  const userRow = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(userRow[7]).toBe(3); // articleCount 2 -> 3
});

test('createArticle does not touch Users at all when the author has no row there (defensive, should not normally happen)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = createArticle(ss, lock, makeInput({ author: 'nobody' }));

  expect(result).toEqual({ success: true }); // article write still succeeds
});

test('createArticle rejects an invalid title and does not write any row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = createArticle(ss, lock, makeInput({ title: '' }));

  expect(result).toEqual({ success: false, error: '標題不能為空' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});
