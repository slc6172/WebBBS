const { getArticlesForRole } = require('../src/articles');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1',
    boardId: 'gossip',
    title: 't',
    author: 'alice',
    content: 'body',
    createdAt: '2026/07/30 12:00:00',
    editedAt: '',
    editedBy: '',
    replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

test('getArticlesForRole returns the article list when role has global read permission AND the board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip', title: '文章' });

  expect(getArticlesForRole(ss, 'user', 'gossip')).toEqual([
    { articleId: 'a1', boardId: 'gossip', title: '文章', author: 'alice', createdAt: '2026/07/30 12:00:00', replyCount: 0 }
  ]);
});

test('getArticlesForRole returns an empty array for newbie, regardless of AllowRoles', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip' });

  expect(getArticlesForRole(ss, 'newbie', 'gossip')).toEqual([]);
});

test('getArticlesForRole returns an empty array when not logged in (null role)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip' });

  expect(getArticlesForRole(ss, null, 'gossip')).toEqual([]);
});

test('getArticlesForRole returns an empty array when the board\'s AllowRoles excludes the role, even though the role has global read permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip' });

  expect(getArticlesForRole(ss, 'user', 'gossip')).toEqual([]);
});

test('getArticlesForRole ignores AllowRoles entirely for admin', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'gossip', title: '文章' });

  expect(getArticlesForRole(ss, 'admin', 'gossip').map(a => a.articleId)).toEqual(['a1']);
});

test('getArticlesForRole rejects a boardId that isn\'t in the board list at all (e.g. a guessed/tampered URL param), even for a role with global read permission', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  // No board row created for 'secret-board' at all.
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', boardId: 'secret-board' });

  expect(getArticlesForRole(ss, 'user', 'secret-board')).toEqual([]);
});
