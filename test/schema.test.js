const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

test('ensureSchema creates all four sheets with the correct header rows', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const headers = {
    Users: ss.getSheetByName('Users').getRange(1, 1, 1, 11).getValues()[0],
    Boards: ss.getSheetByName('Boards').getRange(1, 1, 1, 7).getValues()[0],
    Articles: ss.getSheetByName('Articles').getRange(1, 1, 1, 10).getValues()[0],
    Replies: ss.getSheetByName('Replies').getRange(1, 1, 1, 5).getValues()[0],
    Permission: ss.getSheetByName('Permission').getRange(1, 1, 1, 9).getValues()[0]
  };

  expect(headers).toEqual({
    Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt', 'loginCount', 'lastLoginAt', 'articleCount', 'replyCount', 'lastSeenBoards', 'pendingMentions'],
    Boards: ['boardId', 'boardName', 'description', 'sortOrder', 'latestArticleAt', 'latestReplyAt', 'AllowRoles'],
    Articles: ['articleId', 'boardId', 'title', 'author', 'content', 'createdAt', 'editedAt', 'editedBy', 'replyCount', 'imageUrls'],
    Replies: ['replyId', 'articleId', 'author', 'content', 'createdAt'],
    Permission: ['role', 'articleRead', 'articlePost', 'articleManageOwn', 'replyRead', 'replyPost', 'replyDeleteOwn', 'leaderboard', 'login']
  });
});

test('ensureSchema creates LineGroupBoards and LineStaging with the correct header rows', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const headers = {
    LineGroupBoards: ss.getSheetByName('LineGroupBoards').getRange(1, 1, 1, 5).getValues()[0],
    LineStaging: ss.getSheetByName('LineStaging').getRange(1, 1, 1, 7).getValues()[0]
  };

  expect(headers).toEqual({
    LineGroupBoards: ['groupId', 'groupName', 'boardId', 'lastDigestDate', 'todayDigestCount'],
    LineStaging: ['groupId', 'messageTime', 'displayName', 'messageType', 'content', 'webhookEventId', 'recalled']
  });
});

test('ensureSchema creates LineUserId with the correct header row', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const headers = ss.getSheetByName('LineUserId').getRange(1, 1, 1, 2).getValues()[0];

  expect(headers).toEqual(['userId', 'displayId']);
});

test('ensureSchema forces every timestamp column to plain-text format, so Sheets never auto-converts our date strings into real Date objects', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  // Users.createdAt = column 5, Users.lastLoginAt = column 7,
  // Boards.latestArticleAt = column 5, Boards.latestReplyAt = column 6,
  // Articles.createdAt = column 6, Articles.editedAt = column 7, Replies.createdAt = column 5.
  const usersCalls = ss.getSheetByName('Users')._getNumberFormatCalls();
  const boardsCalls = ss.getSheetByName('Boards')._getNumberFormatCalls();
  const articlesCalls = ss.getSheetByName('Articles')._getNumberFormatCalls();
  const repliesCalls = ss.getSheetByName('Replies')._getNumberFormatCalls();

  expect(usersCalls.some(c => c.col === 5 && c.format === '@')).toBe(true);
  expect(usersCalls.some(c => c.col === 7 && c.format === '@')).toBe(true);
  expect(boardsCalls.some(c => c.col === 5 && c.format === '@')).toBe(true);
  expect(boardsCalls.some(c => c.col === 6 && c.format === '@')).toBe(true);
  expect(articlesCalls.some(c => c.col === 6 && c.format === '@')).toBe(true);
  expect(articlesCalls.some(c => c.col === 7 && c.format === '@')).toBe(true);
  expect(repliesCalls.some(c => c.col === 5 && c.format === '@')).toBe(true);
});

test('ensureSchema forces LineGroupBoards.lastDigestDate and LineStaging.messageTime to plain-text format too, same as createdAt/editedAt elsewhere', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const groupBoardsCalls = ss.getSheetByName('LineGroupBoards')._getNumberFormatCalls();
  const stagingCalls = ss.getSheetByName('LineStaging')._getNumberFormatCalls();

  expect(groupBoardsCalls.some(c => c.col === 4 && c.format === '@')).toBe(true);
  expect(stagingCalls.some(c => c.col === 2 && c.format === '@')).toBe(true);
});

test('ensureSchema seeds default newbie/user/admin rows the first time the Permission sheet is created, matching today\'s actual hardcoded behaviour', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const rows = ss.getSheetByName('Permission').getRange(2, 1, 3, 9).getValues();
  expect(rows).toEqual([
    ['newbie', false, false, false, false, false, false, false, true],
    ['user', true, true, true, true, true, true, true, true],
    ['admin', true, true, true, true, true, true, true, true]
  ]);
});

test('ensureSchema never touches Permission data again once any data row exists, even after an admin has manually edited it', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss); // first call: seeds the 3 default rows

  // Simulate an admin manually editing the sheet directly in Google Sheets:
  // turning off replyDeleteOwn for 'user', and adding a brand-new custom
  // role that ensureSchema has never heard of.
  ss.getSheetByName('Permission').getRange(3, 1, 1, 9).setValues([
    ['user', true, true, true, true, true, false, true, true]
  ]);
  ss.getSheetByName('Permission').appendRow(
    ['reject', false, false, false, false, false, false, false, false]
  );

  ensureSchema(ss); // second call: must be a complete no-op on this sheet's data
  ensureSchema(ss); // third call, just to be sure repeated calls stay inert

  const rows = ss.getSheetByName('Permission').getRange(2, 1, 4, 9).getValues();
  expect(rows).toEqual([
    ['newbie', false, false, false, false, false, false, false, true],
    ['user', true, true, true, true, true, false, true, true],
    ['admin', true, true, true, true, true, true, true, true],
    ['reject', false, false, false, false, false, false, false, false]
  ]);
});

test('ensureSchema applies a role dropdown validation to Users.role, sourced from the Permission sheet\'s role list, when a rule builder is supplied', () => {
  const ss = createFakeSpreadsheet();
  const buildRoleValidationRule = (roleNames) => ({ type: 'roleList', roleNames: roleNames });

  ensureSchema(ss, buildRoleValidationRule);

  const calls = ss.getSheetByName('Users')._getDataValidationCalls();
  expect(calls.length).toBe(1);
  expect(calls[0].row).toBe(2); // starts below the header row
  expect(calls[0].col).toBe(4); // Users.role is the 4th column
  expect(calls[0].rule).toEqual({ type: 'roleList', roleNames: ['newbie', 'user', 'admin'] });
});

test('ensureSchema does not touch data validation at all when no rule builder is supplied (existing single-arg callers stay unaffected)', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  expect(ss.getSheetByName('Users')._getDataValidationCalls()).toEqual([]);
});

test('ensureSchema is idempotent — calling it twice does not corrupt the header row', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);
  ensureSchema(ss);

  expect(ss.getSheetByName('Users').getRange(1, 1, 1, 10).getValues()[0]).toEqual(
    ['userId', 'passwordHash', 'salt', 'role', 'createdAt', 'loginCount', 'lastLoginAt', 'articleCount', 'replyCount', 'lastSeenBoards']
  );
});

test('ensureSchema backfills AllowRoles to "ALL" on existing boards the first time this column is added, so a deploy doesn\'t make every board vanish', () => {
  const ss = createFakeSpreadsheet();
  // Simulate a pre-existing deployment: Boards already has the OLD 6-column
  // header and real data, written before AllowRoles existed.
  const boardsSheet = ss.insertSheet('Boards');
  boardsSheet.getRange(1, 1, 1, 6).setValues([
    ['boardId', 'boardName', 'description', 'sortOrder', 'latestArticleAt', 'latestReplyAt']
  ]);
  boardsSheet.appendRow(['gossip', '八卦板', '閒聊', 1, '', '']);
  boardsSheet.appendRow(['movie', '電影板', '討論電影', 2, '', '']);

  ensureSchema(ss); // first call after this feature ships — the migration moment

  expect(boardsSheet.getRange(2, 7, 2, 1).getValues()).toEqual([['ALL'], ['ALL']]);

  // A board added AFTER the migration moment must NOT be auto-filled —
  // blank is a deliberate choice the admin makes for new boards from now on.
  boardsSheet.appendRow(['new-board', '新看板', '之後才加的', 3, '', '', '']);
  ensureSchema(ss); // second call, well after the column already exists

  expect(boardsSheet.getRange(4, 7, 1, 1).getValues()).toEqual([['']]);
});

test('ensureSchema never re-touches AllowRoles once the column already exists, even if an admin has since customised individual boards', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss); // Boards created fresh, already with the AllowRoles column
  ss.getSheetByName('Boards').appendRow(['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  ss.getSheetByName('Boards').appendRow(['secret', '密板', '只給管理員', 2, '', '', 'admin']);

  ensureSchema(ss);
  ensureSchema(ss);

  expect(ss.getSheetByName('Boards').getRange(2, 7, 2, 1).getValues()).toEqual([['ALL'], ['admin']]);
});
