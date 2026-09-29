const { getArticleDetailForSnapshot_: getArticleDetailForSnapshot } = require('../src/articleDetail');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('getArticleDetailForSnapshot returns the article and its replies when the snapshot allows both', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['gossip'] };

  const result = getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(result.article).toEqual({
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01', content: '內文', createdAt: '2026/07/30 12:00:00',
    editedAt: '', editedBy: '', imageUrls: []
  });
  expect(result.replies).toEqual([
    { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' }
  ]);
});

test('getArticleDetailForSnapshot returns null article and empty replies for a snapshot with no permissions (newbie-equivalent)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const snapshot = { permissions: { articleRead: false, replyRead: false }, allowedBoardIds: [] };

  expect(getArticleDetailForSnapshot(ss, snapshot, 'a1')).toEqual({ article: null, replies: [] });
});

test('getArticleDetailForSnapshot returns null article and empty replies when the article does not exist', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['gossip'] };

  expect(getArticleDetailForSnapshot(ss, snapshot, 'does-not-exist')).toEqual({ article: null, replies: [] });
});

test('getArticleDetailForSnapshot returns null article and empty replies when the article\'s boardId is not in allowedBoardIds, even with global permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['movie'] }; // gossip not included

  expect(getArticleDetailForSnapshot(ss, snapshot, 'a1')).toEqual({ article: null, replies: [] });
});

test('getArticleDetailForSnapshot lets a snapshot see the article but not its replies when it only has articleRead, not replyRead (independent gating)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  const snapshot = { permissions: { articleRead: true, replyRead: false }, allowedBoardIds: ['gossip'] };

  const result = getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(result.article).not.toBeNull();
  expect(result.article.articleId).toBe('a1');
  expect(result.replies).toEqual([]);
});

test('getArticleDetailForSnapshot lets a snapshot see replies but not the article when it only has replyRead, not articleRead (independent gating, the reverse combo)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  const snapshot = { permissions: { articleRead: false, replyRead: true }, allowedBoardIds: ['gossip'] };

  const result = getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(result.article).toBeNull();
  expect(result.replies).toEqual([
    { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' }
  ]);
});

test('getArticleDetailForSnapshot sees everything for an admin-equivalent snapshot (boardId present regardless of what AllowRoles would have said)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  // buildRoleSnapshot already bakes admin's AllowRoles bypass into allowedBoardIds —
  // this snapshot just represents what that produces, without depending on boards.js here.
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['gossip'] };

  const result = getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(result.article).not.toBeNull();
  expect(result.replies.length).toBe(1);
});

test('getArticleDetailForSnapshot returns null article and empty replies when the snapshot itself is null (not logged in / cache miss)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  expect(getArticleDetailForSnapshot(ss, null, 'a1')).toEqual({ article: null, replies: [] });
});

test('getArticleDetailForSnapshot never reads the Boards or Permission sheets — gating comes entirely from the snapshot', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), {});
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['gossip'] };
  const boardsReadsBefore = ss.getSheetByName('Boards')._getReadCount();
  const permissionReadsBefore = ss.getSheetByName('Permission')._getReadCount();

  getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(ss.getSheetByName('Boards')._getReadCount()).toBe(boardsReadsBefore);
  expect(ss.getSheetByName('Permission')._getReadCount()).toBe(permissionReadsBefore);
});

// mycr 第 15 輪票 05（見 F-15）：修法前既有的列，如果 title/content
// 剛好長得像數字/日期/時間/布林值，可能已經被 Sheets 自動轉成對應型別。
// 這裡直接塞一個非字串值模擬「修法前就已經被轉換過」的既有資料，確認
// 讀取路徑對舊資料仍然寬容，回傳的是字串。
test('getArticleDetailForSnapshot coerces non-string title/content/reply-content (from pre-fix rows already auto-converted by Sheets) to strings', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { title: 12345, content: true });
  seedReply(ss.getSheetByName('Replies'), { content: 5678 });
  const snapshot = { permissions: { articleRead: true, replyRead: true }, allowedBoardIds: ['gossip'] };

  const result = getArticleDetailForSnapshot(ss, snapshot, 'a1');

  expect(result.article.title).toBe('12345');
  expect(result.article.content).toBe('true');
  expect(result.replies[0].content).toBe('5678');
});
