const { getBoardBulkPage, findArticlePageIndex } = require('../src/boardBulk');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0,
    imageUrls: []
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, JSON.stringify(a.imageUrls)]);
}

test('findArticlePageIndex returns 0 when the article is on the first page', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  expect(findArticlePageIndex(ss, 'gossip', 'a1', 300)).toBe(0);
});

test('findArticlePageIndex returns the correct later page index when the article sorts past the first page boundary', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' }); // 最舊，pageSize=2 時落在第 1 頁
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  seedArticle(articlesSheet, { articleId: 'a3', createdAt: '2026/07/30 11:00:00' }); // 最新，落在第 0 頁

  expect(findArticlePageIndex(ss, 'gossip', 'a3', 2)).toBe(0);
  expect(findArticlePageIndex(ss, 'gossip', 'a2', 2)).toBe(0);
  expect(findArticlePageIndex(ss, 'gossip', 'a1', 2)).toBe(1);
});

test('findArticlePageIndex returns null when the articleId does not exist', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  expect(findArticlePageIndex(ss, 'gossip', 'does-not-exist', 300)).toBe(null);
});

test('findArticlePageIndex ignores articles belonging to a different board', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'movie' });

  expect(findArticlePageIndex(ss, 'gossip', 'a1', 300)).toBe(null);
});

test('findArticlePageIndex uses BOARD_BULK_PAGE_SIZE as the default when pageSize is omitted', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  expect(findArticlePageIndex(ss, 'gossip', 'a1')).toBe(0);
});

test('findArticlePageIndex\'s result is consistent with which page getBoardBulkPage actually returns the article on', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  seedArticle(articlesSheet, { articleId: 'a3', createdAt: '2026/07/30 11:00:00' });

  const pageIndex = findArticlePageIndex(ss, 'gossip', 'a1', 2);
  const page = getBoardBulkPage(ss, 'gossip', pageIndex, 2);

  expect(page.articles.map(a => a.articleId)).toContain('a1');
});
