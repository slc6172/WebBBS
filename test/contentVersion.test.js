const { getBoardVersion, bumpBoardVersion, getArticleVersion, bumpArticleVersion } = require('../src/contentVersion');
const { createFakeCache } = require('./doubles/fakeCache');

test('getBoardVersion returns null when nothing has ever been written for that boardId', () => {
  const cache = createFakeCache();

  expect(getBoardVersion(cache, 'board-1')).toBeNull();
});

test('bumpBoardVersion then getBoardVersion returns the value that was just written', () => {
  const cache = createFakeCache();

  bumpBoardVersion(cache, 'board-1', 'v-abc-123');

  expect(getBoardVersion(cache, 'board-1')).toBe('v-abc-123');
});

test('bumping one boardId does not affect another boardId\'s version', () => {
  const cache = createFakeCache();

  bumpBoardVersion(cache, 'board-1', 'v-1');
  bumpBoardVersion(cache, 'board-2', 'v-2');

  expect(getBoardVersion(cache, 'board-1')).toBe('v-1');
  expect(getBoardVersion(cache, 'board-2')).toBe('v-2');
  expect(getBoardVersion(cache, 'board-3')).toBeNull();
});

test('bumping the same boardId again overwrites the previous version value', () => {
  const cache = createFakeCache();

  bumpBoardVersion(cache, 'board-1', 'v-old');
  bumpBoardVersion(cache, 'board-1', 'v-new');

  expect(getBoardVersion(cache, 'board-1')).toBe('v-new');
});

// ---- 文章版本（優化輪 ticket 04 / #1b），行為跟看板版本完全對稱 ----

test('getArticleVersion returns null when nothing has ever been written for that articleId', () => {
  const cache = createFakeCache();

  expect(getArticleVersion(cache, 'article-1')).toBeNull();
});

test('bumpArticleVersion then getArticleVersion returns the value that was just written', () => {
  const cache = createFakeCache();

  bumpArticleVersion(cache, 'article-1', 'v-abc-123');

  expect(getArticleVersion(cache, 'article-1')).toBe('v-abc-123');
});

test('bumping one articleId does not affect another articleId\'s version', () => {
  const cache = createFakeCache();

  bumpArticleVersion(cache, 'article-1', 'v-1');
  bumpArticleVersion(cache, 'article-2', 'v-2');

  expect(getArticleVersion(cache, 'article-1')).toBe('v-1');
  expect(getArticleVersion(cache, 'article-2')).toBe('v-2');
  expect(getArticleVersion(cache, 'article-3')).toBeNull();
});

test('board version and article version live in separate keyspaces even with the same id string', () => {
  const cache = createFakeCache();

  bumpBoardVersion(cache, 'shared-id', 'board-value');
  bumpArticleVersion(cache, 'shared-id', 'article-value');

  expect(getBoardVersion(cache, 'shared-id')).toBe('board-value');
  expect(getArticleVersion(cache, 'shared-id')).toBe('article-value');
});
