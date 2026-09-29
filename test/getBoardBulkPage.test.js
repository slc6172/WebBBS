const { getBoardBulkPage_: getBoardBulkPage } = require('../src/boardBulk');
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

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('getBoardBulkPage returns articles with full content, newest first', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00', content: '第一篇' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 11:00:00', content: '第二篇' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.articles.map(a => a.articleId)).toEqual(['a2', 'a1']);
  expect(result.articles[0].content).toBe('第二篇');
});

// ---- 圖片張數突破：imageUrl1~3 併成單一 imageUrls 陣列 ----

test('getBoardBulkPage surfaces imageUrls as an array, not the old imageUrl1~3 fields', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', imageUrls: ['https://drive.example/1', 'https://drive.example/2'] });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.articles[0].imageUrls).toEqual(['https://drive.example/1', 'https://drive.example/2']);
  expect(result.articles[0].imageUrl1).toBeUndefined();
});

test('getBoardBulkPage surfaces more than 3 imageUrls for a single article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  const fiveUrls = ['1', '2', '3', '4', '5'].map(function (n) { return 'https://drive.example/' + n; });
  seedArticle(articlesSheet, { articleId: 'a1', imageUrls: fiveUrls });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.articles[0].imageUrls).toEqual(fiveUrls);
});

test('getBoardBulkPage surfaces an empty imageUrls array for an article with no images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.articles[0].imageUrls).toEqual([]);
});

test('getBoardBulkPage page 0 returns only the newest pageSize articles and flags hasMore when there are older ones left', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  seedArticle(articlesSheet, { articleId: 'a3', createdAt: '2026/07/30 11:00:00' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 2);

  expect(result.articles.map(a => a.articleId)).toEqual(['a3', 'a2']);
  expect(result.hasMore).toBe(true);
});

test('getBoardBulkPage page 1 returns the remaining older article and hasMore is false when nothing is left', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  seedArticle(articlesSheet, { articleId: 'a3', createdAt: '2026/07/30 11:00:00' });

  const result = getBoardBulkPage(ss, 'gossip', 1, 2);

  expect(result.articles.map(a => a.articleId)).toEqual(['a1']);
  expect(result.hasMore).toBe(false);
});

test('getBoardBulkPage returns an empty article array and hasMore false when pageIndex is past the last page', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  const result = getBoardBulkPage(ss, 'gossip', 5, 300);

  expect(result.articles).toEqual([]);
  expect(result.hasMore).toBe(false);
});

// 安全性審查 M2 回歸測試：見 gas-bbs-perf-round-review.md M2。pageIndex
// 是客戶端直接傳入的參數，修復前負數會觸發 Array.slice 的「從陣列尾端
// 算起」語意，不是「翻頁」該有的行為。
test('getBoardBulkPage normalizes a negative pageIndex to page 0 instead of slicing from the end of the array', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 11:00:00' });

  const negative = getBoardBulkPage(ss, 'gossip', -1, 300);
  const zero = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(negative.articles.map(a => a.articleId)).toEqual(zero.articles.map(a => a.articleId));
});

test('getBoardBulkPage normalizes a non-numeric pageIndex to page 0 instead of producing a NaN slice', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  const result = getBoardBulkPage(ss, 'gossip', 'not-a-number', 300);

  expect(result.articles.map(a => a.articleId)).toEqual(['a1']);
});

test('getBoardBulkPage normalizes a fractional pageIndex by flooring it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  for (let i = 1; i <= 4; i++) {
    seedArticle(articlesSheet, { articleId: 'a' + i, createdAt: '2026/07/30 0' + i + ':00:00' });
  }

  const fractional = getBoardBulkPage(ss, 'gossip', 1.9, 2);
  const flooredToOne = getBoardBulkPage(ss, 'gossip', 1, 2);

  expect(fractional.articles.map(a => a.articleId)).toEqual(flooredToOne.articles.map(a => a.articleId));
});

test('getBoardBulkPage groups each page article\'s replies under its articleId', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1', content: '推!' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.repliesByArticleId.a1).toEqual([
    { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' }
  ]);
});

test('getBoardBulkPage does not leak one article\'s replies into another\'s bucket', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  const repliesSheet = ss.getSheetByName('Replies');
  seedReply(repliesSheet, { replyId: 'r1', articleId: 'a1', content: '給a1的推' });
  seedReply(repliesSheet, { replyId: 'r2', articleId: 'a2', content: '給a2的推' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.repliesByArticleId.a1.map(r => r.replyId)).toEqual(['r1']);
  expect(result.repliesByArticleId.a2.map(r => r.replyId)).toEqual(['r2']);
});

test('getBoardBulkPage gives an article with zero replies an empty array, not a missing key', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.repliesByArticleId.a1).toEqual([]);
});

test('getBoardBulkPage reads the Replies sheet exactly once, regardless of how many articles are on the page', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  const repliesSheet = ss.getSheetByName('Replies');
  for (let i = 1; i <= 5; i++) {
    seedArticle(articlesSheet, { articleId: 'a' + i, createdAt: '2026/07/30 0' + i + ':00:00' });
    seedReply(repliesSheet, { replyId: 'r' + i, articleId: 'a' + i });
  }
  const repliesReadsBefore = repliesSheet._getReadCount();

  getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(repliesSheet._getReadCount() - repliesReadsBefore).toBe(1);
});

test('getBoardBulkPage reads the Articles sheet exactly once per call', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 13:00:00' });
  const articlesReadsBefore = articlesSheet._getReadCount();

  getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(articlesSheet._getReadCount() - articlesReadsBefore).toBe(1);
});

test('getBoardBulkPage returns an empty structure, not an error, for a board with zero articles', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result).toEqual({ articles: [], repliesByArticleId: {}, hasMore: false, totalCount: 0, pageSize: 300 });
});

test('getBoardBulkPage returns totalCount as the board\'s full article count regardless of which page is requested', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', createdAt: '2026/07/30 09:00:00' });
  seedArticle(articlesSheet, { articleId: 'a2', createdAt: '2026/07/30 10:00:00' });
  seedArticle(articlesSheet, { articleId: 'a3', createdAt: '2026/07/30 11:00:00' });

  const page0 = getBoardBulkPage(ss, 'gossip', 0, 2);
  const page1 = getBoardBulkPage(ss, 'gossip', 1, 2);

  expect(page0.totalCount).toBe(3);
  expect(page1.totalCount).toBe(3);
  expect(page0.pageSize).toBe(2);
});

// mycr 第 15 輪票 05（見 F-15）：修法前既有的列，如果 title/content
// 剛好長得像數字/日期/時間/布林值，可能已經被 Sheets 自動轉成對應型別。
// 這裡直接塞一個非字串值模擬「修法前就已經被轉換過」的既有資料，確認
// 讀取路徑對舊資料仍然寬容，回傳的是字串，不是原始的 Date/Number/
// Boolean 值。
test('getBoardBulkPage coerces non-string title/content (from pre-fix rows already auto-converted by Sheets) to strings', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const articlesSheet = ss.getSheetByName('Articles');
  seedArticle(articlesSheet, { articleId: 'a1', title: 12345, content: true });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.articles[0].title).toBe('12345');
  expect(result.articles[0].content).toBe('true');
});

test('getBoardBulkPage coerces a non-string reply content (from a pre-fix row) to a string', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { articleId: 'a1', content: 5678 });

  const result = getBoardBulkPage(ss, 'gossip', 0, 300);

  expect(result.repliesByArticleId.a1[0].content).toBe('5678');
});
