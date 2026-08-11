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

test('createArticle writes provided image URLs into imageUrl1~3 (optimization ticket 09)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput({
    imageUrls: ['https://drive.example.com/file/1', 'https://drive.example.com/file/2']
  }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 12).getValues()[0];
  expect(row[9]).toBe('https://drive.example.com/file/1');
  expect(row[10]).toBe('https://drive.example.com/file/2');
  expect(row[11]).toBe(''); // third slot left blank
});

test('createArticle leaves imageUrl1~3 blank when no images were attached', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  createArticle(ss, lock, makeInput()); // no imageUrls field at all

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 12).getValues()[0];
  expect(row[9]).toBe('');
  expect(row[10]).toBe('');
  expect(row[11]).toBe('');
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
