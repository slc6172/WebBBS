const { createArticleForRole } = require('../src/postArticle');
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

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

test('createArticleForRole writes the article when role has global post permission AND the target board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  const lock = createFakeLock();

  const result = createArticleForRole(ss, lock, 'user', makeInput());

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});

test('createArticleForRole rejects newbie and writes no row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  const lock = createFakeLock();

  const result = createArticleForRole(ss, lock, 'newbie', makeInput());

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('createArticleForRole rejects a role with global post permission when the target board\'s AllowRoles excludes it, and writes no row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  const lock = createFakeLock();

  const result = createArticleForRole(ss, lock, 'user', makeInput());

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('createArticleForRole rejects posting to a boardId that doesn\'t match any existing board (e.g. a tampered request), even for a role with global post permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  // No board row for 'not-a-real-board' at all.
  const lock = createFakeLock();

  const result = createArticleForRole(ss, lock, 'user', makeInput({ boardId: 'not-a-real-board' }));

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('createArticleForRole ignores AllowRoles entirely for admin', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  const lock = createFakeLock();

  const result = createArticleForRole(ss, lock, 'admin', makeInput());

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
});
