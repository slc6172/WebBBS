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
    imageUrl1: '',
    imageUrl2: '',
    imageUrl3: ''
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, a.imageUrl1, a.imageUrl2, a.imageUrl3]);
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
    imageUrl1: '',
    imageUrl2: '',
    imageUrl3: ''
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

test('getArticleById includes populated image URLs (optimization ticket 09)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {
    imageUrl1: 'https://drive.example.com/file/1',
    imageUrl2: 'https://drive.example.com/file/2'
    // imageUrl3 left blank — only 2 of the 3 slots used
  });

  const result = getArticleById(ss, 'a1');

  expect(result.imageUrl1).toBe('https://drive.example.com/file/1');
  expect(result.imageUrl2).toBe('https://drive.example.com/file/2');
  expect(result.imageUrl3).toBe('');
});

test('getArticleById returns null when no article matches the id', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  expect(getArticleById(ss, 'does-not-exist')).toBeNull();
});
