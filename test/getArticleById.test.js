const { getArticleById } = require('../src/articleDetail');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1',
    boardId: 'gossip',
    title: '標題',
    author: 'alice01',
    content: '完整內文',
    createdAt: '2026/07/30 12:00:00',
    editedAt: '',
    editedBy: '',
    replyCount: 0,
    imageUrls: []
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, JSON.stringify(a.imageUrls)]);
}

test('getArticleById returns the full article including content', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  expect(getArticleById(ss, 'a1')).toEqual({
    articleId: 'a1',
    boardId: 'gossip',
    title: '標題',
    author: 'alice01',
    content: '完整內文',
    createdAt: '2026/07/30 12:00:00',
    editedAt: '',
    editedBy: '',
    imageUrls: []
  });
});

test('getArticleById includes editedAt/editedBy for an article that has been edited', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {
    editedAt: '2026/07/30 18:00:00',
    editedBy: 'alice01'
  });

  const result = getArticleById(ss, 'a1');

  expect(result.editedAt).toBe('2026/07/30 18:00:00');
  expect(result.editedBy).toBe('alice01');
});

test('getArticleById includes populated image URLs as an array (optimization ticket 09)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {
    imageUrls: ['https://drive.example.com/file/1', 'https://drive.example.com/file/2']
  });

  const result = getArticleById(ss, 'a1');

  expect(result.imageUrls).toEqual(['https://drive.example.com/file/1', 'https://drive.example.com/file/2']);
});

test('getArticleById returns an empty imageUrls array when the article has no images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  expect(getArticleById(ss, 'a1').imageUrls).toEqual([]);
});

// ---- 圖片張數突破 ----

test('getArticleById returns more than 3 image URLs for a single article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const fiveUrls = ['1', '2', '3', '4', '5'].map(function (n) { return 'https://drive.example.com/file/' + n; });
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: fiveUrls });

  const result = getArticleById(ss, 'a1');

  expect(result.imageUrls).toEqual(fiveUrls);
});

test('getArticleById returns null when no article matches the id', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  expect(getArticleById(ss, 'does-not-exist')).toBeNull();
});
