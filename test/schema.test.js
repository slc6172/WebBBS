const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

test('ensureSchema creates all four sheets with the correct header rows', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const headers = {
    Users: ss.getSheetByName('Users').getRange(1, 1, 1, 5).getValues()[0],
    Boards: ss.getSheetByName('Boards').getRange(1, 1, 1, 4).getValues()[0],
    Articles: ss.getSheetByName('Articles').getRange(1, 1, 1, 9).getValues()[0],
    Replies: ss.getSheetByName('Replies').getRange(1, 1, 1, 5).getValues()[0]
  };

  expect(headers).toEqual({
    Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt'],
    Boards: ['boardId', 'boardName', 'description', 'sortOrder'],
    Articles: ['articleId', 'boardId', 'title', 'author', 'content', 'createdAt', 'editedAt', 'editedBy', 'replyCount'],
    Replies: ['replyId', 'articleId', 'author', 'content', 'createdAt']
  });
});

test('ensureSchema forces every timestamp column to plain-text format, so Sheets never auto-converts our date strings into real Date objects', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  // Users.createdAt = column 5, Articles.createdAt = column 6,
  // Articles.editedAt = column 7, Replies.createdAt = column 5.
  const usersCalls = ss.getSheetByName('Users')._getNumberFormatCalls();
  const articlesCalls = ss.getSheetByName('Articles')._getNumberFormatCalls();
  const repliesCalls = ss.getSheetByName('Replies')._getNumberFormatCalls();

  expect(usersCalls.some(c => c.col === 5 && c.format === '@')).toBe(true);
  expect(articlesCalls.some(c => c.col === 6 && c.format === '@')).toBe(true);
  expect(articlesCalls.some(c => c.col === 7 && c.format === '@')).toBe(true);
  expect(repliesCalls.some(c => c.col === 5 && c.format === '@')).toBe(true);
});

test('ensureSchema is idempotent — calling it twice does not corrupt the header row', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);
  ensureSchema(ss);

  expect(ss.getSheetByName('Users').getRange(1, 1, 1, 5).getValues()[0]).toEqual(
    ['userId', 'passwordHash', 'salt', 'role', 'createdAt']
  );
});
