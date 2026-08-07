const { editArticleForRole } = require('../src/editArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '原標題', author: 'alice01',
    content: '原內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function makeUpdates(overrides) {
  return Object.assign({ title: '新標題', content: '新內文', editedAt: '2026/07/30 18:00:00' }, overrides);
}

test('editArticleForRole edits the article when role passes the gate and the requester owns it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticleForRole(ss, 'user', 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
});

test('editArticleForRole rejects newbie and makes no changes, even for the article owner', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticleForRole(ss, 'newbie', 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
});

test('editArticleForRole lets an admin edit someone else\'s article, recording editedBy as the admin', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  const result = editArticleForRole(ss, 'admin', 'admin01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe('admin01');
});
