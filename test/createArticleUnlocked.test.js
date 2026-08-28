const { createArticleUnlocked_ } = require('../src/postArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

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

test('createArticleUnlocked_ writes a new row to Articles with the given fields, without needing a lock', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = createArticleUnlocked_(ss, makeInput());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row).toEqual(['a1', 'gossip', '標題', 'alice01', '內文', '2026/07/30 12:00:00', '', '', 0]);
});

test('createArticleUnlocked_ increments the author\'s articleCount in Users', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  ss.getSheetByName('Users').appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 2, 0]);

  createArticleUnlocked_(ss, makeInput({ author: 'alice01' }));

  const userRow = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(userRow[7]).toBe(3); // articleCount 2 -> 3
});

test('createArticleUnlocked_ writes a SYSTEM-authored article without a Users row, and does not blow up', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = createArticleUnlocked_(ss, makeInput({ author: 'SYSTEM' }));

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 4).getValues()[0];
  expect(row[3]).toBe('SYSTEM');
});

test('createArticleUnlocked_ writes provided image URLs into the imageUrls column as a JSON array', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  createArticleUnlocked_(ss, makeInput({
    imageUrls: ['https://drive.example.com/file/1', 'https://drive.example.com/file/2']
  }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(row[9]).toBe('["https://drive.example.com/file/1","https://drive.example.com/file/2"]');
});

test('createArticleUnlocked_ writes "[]" when no image URLs are given (canonical empty marker)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  createArticleUnlocked_(ss, makeInput());

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(row[9]).toBe('[]');
});

// ---- 圖片張數突破 ----

test('createArticleUnlocked_ writes more than 3 image URLs without truncating (fixes the old LINE digest silent-drop bug)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const fiveUrls = ['1', '2', '3', '4', '5'].map(function (n) { return 'https://drive.example.com/file/' + n; });

  createArticleUnlocked_(ss, makeInput({ imageUrls: fiveUrls }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(fiveUrls);
});

test('createArticleUnlocked_ escapes a formula-injection-shaped URL before JSON-encoding it (M1 carried forward into the array format)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  createArticleUnlocked_(ss, makeInput({ imageUrls: ['=HYPERLINK("evil")'] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(["'=HYPERLINK(\"evil\")"]);
});

test('createArticleUnlocked_ defensively caps to 99 images even when given more, without erroring (no interactive caller to show an error to, e.g. the LINE digest harvester)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const tooMany = [];
  for (let i = 0; i < 101; i++) {
    tooMany.push('https://drive.example.com/file/' + i);
  }

  const result = createArticleUnlocked_(ss, makeInput({ imageUrls: tooMany }));

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toHaveLength(99);
});
