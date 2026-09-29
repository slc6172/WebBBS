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

// mycr 第 15 輪票 05：原本這裡驗證「開頭像公式的 URL 會被跳脫」，是
// 沿用 M1 修復（title/content 防公式注入）的邏輯類推到 imageUrls。但
// imageUrls 是整包 JSON.stringify 之後才寫進「一整格」，不是像 title
// 那樣獨立佔一格——這一整格永遠以 `[` 開頭，Sheets 的公式判讀本來就不
// 會觸發，對陣列元素逐一跳脫從來沒有真的防到任何風險，純粹是跟
// title/content 用同一招的表面一致，不是真的有效的縱深防禦。
// escapeFormulaInjection 改成一律加前綴後，如果繼續在這裡套用，會讓
// 每一個合法圖片連結在讀回來時都多一個游離的撇號，直接打不開——所以
// 拿掉了這裡的跳脫。改成驗證：即使 URL 長得像公式，也會原封不動存進
// imageUrls（這本來就不影響安全性——這個欄位從頭到尾只被拿來組
// `<img>` 標籤跟比對 Drive 檔案網址，不會被當成公式執行，也不會被
// 當成可執行內容處理）。
test('createArticleUnlocked_ stores a formula-injection-shaped URL as-is in imageUrls (the JSON array cell can never itself be misread as a formula, so per-element escaping there never protected anything and only risked corrupting real image links)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  createArticleUnlocked_(ss, makeInput({ imageUrls: ['=HYPERLINK("evil")'] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(['=HYPERLINK("evil")']);
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
