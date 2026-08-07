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

test('createArticle rejects an invalid title and does not write any row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = createArticle(ss, lock, makeInput({ title: '' }));

  expect(result).toEqual({ success: false, error: '標題不能為空' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});
