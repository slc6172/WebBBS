const {
  ensureSchema,
  ensureSchemaIfNeeded_,
  SCHEMA_VERSION,
  SCHEMA_VERSION_PROPERTY_KEY,
  SHEET_HEADERS,
  TIMESTAMP_COLUMNS,
  DEFAULT_PERMISSION_ROWS
} = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeProperties } = require('./doubles/fakeProperties');

test('ensureSchema creates all four sheets with the correct header rows', () => {
  const ss = createFakeSpreadsheet();

  ensureSchema(ss);

  const headers = {
    Users: ss.getSheetByName('Users').getRange(1, 1, 1, 12).getValues()[0],
    Boards: ss.getSheetByName('Boards').getRange(1, 1, 1, 7).getValues()[0],
    Articles: ss.getSheetByName('Articles').getRange(1, 1, 1, 10).getValues()[0],
    Replies: ss.getSheetByName('Replies').getRange(1, 1, 1, 5).getValues()[0],
    Permission: ss.getSheetByName('Permission').getRange(1, 1, 1, 9).getValues()[0]
  };

  expect(headers).toEqual({
    // `/mycr` 深層複掃 Finding 1：credentialVersion（第 12 欄）
    Users: ['userId', 'passwordHash', 'salt', 'role', 'createdAt', 'loginCount', 'lastLoginAt', 'articleCount', 'replyCount', 'lastSeenBoards', 'pendingMentions', 'credentialVersion'],
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

// mycr 第 15 輪票 14（見 F-07）：ensureSchemaIfNeeded_ 是給 Code.js 的
// doGet 用的版本閘門——只在「已套用版本」比程式碼裡的 SCHEMA_VERSION
// 舊的時候，才真的呼叫 ensureSchema 做完整檢查；否則只讀一個屬性值，
// 完全不碰 SpreadsheetApp。ensureSchema 本身的簽名/行為不受影響，這裡
// 只測新加的閘門函式。
describe('ensureSchemaIfNeeded_', () => {
  test('runs the full ensureSchema and records the current version when no version has been recorded yet (first-ever deployment)', () => {
    const ss = createFakeSpreadsheet();
    const properties = createFakeProperties();

    ensureSchemaIfNeeded_(ss, properties);

    expect(ss.getSheetByName('Users')).toBeTruthy(); // 真的執行了完整檢查
    expect(properties.get(SCHEMA_VERSION_PROPERTY_KEY)).toBe(String(SCHEMA_VERSION));
  });

  test('skips calling ensureSchema entirely when the recorded version already matches the current SCHEMA_VERSION', () => {
    const ss = createFakeSpreadsheet();
    const properties = createFakeProperties();
    properties.set(SCHEMA_VERSION_PROPERTY_KEY, String(SCHEMA_VERSION));

    let getSheetByNameCalls = 0;
    const spy = { getSheetByName: (name) => { getSheetByNameCalls++; return ss.getSheetByName(name); }, insertSheet: ss.insertSheet.bind(ss) };

    ensureSchemaIfNeeded_(spy, properties);

    expect(getSheetByNameCalls).toBe(0); // 完全沒有碰 SpreadsheetApp
  });

  test('re-runs the full ensureSchema when the recorded version is older than the current SCHEMA_VERSION', () => {
    const ss = createFakeSpreadsheet();
    const properties = createFakeProperties();
    properties.set(SCHEMA_VERSION_PROPERTY_KEY, String(SCHEMA_VERSION - 1));

    ensureSchemaIfNeeded_(ss, properties);

    expect(ss.getSheetByName('Users')).toBeTruthy();
    expect(properties.get(SCHEMA_VERSION_PROPERTY_KEY)).toBe(String(SCHEMA_VERSION));
  });

  test('passes buildRoleValidationRule through to the underlying ensureSchema call', () => {
    const ss = createFakeSpreadsheet();
    const properties = createFakeProperties();
    let calledWithRoles = null;
    const buildRule = (roles) => { calledWithRoles = roles; return {}; };

    ensureSchemaIfNeeded_(ss, properties, buildRule);

    expect(calledWithRoles).toEqual(['newbie', 'user', 'admin']);
  });
});

// mycr 第 15 輪票 14：守門測試——目前的 schema 結構定義（表頭、時間戳欄位
// 設定、預設權限列）算出一個穩定的指紋字串，跟這裡寫死的「已知良好」
// 字串比對。改了上面任何一個定義、卻忘記把 SCHEMA_VERSION 往上調，這個
// 測試就會失敗——不用等到真的在 GAS 上發現閘門沒有生效才發現忘記做這
// 一步。
//
// 故意刻意調整 SHEET_HEADERS/TIMESTAMP_COLUMNS/DEFAULT_PERMISSION_ROWS
// 其中任何一個，並且跟著把 SCHEMA_VERSION 加 1、把下面這個字串換成新的
// 指紋（跑一次這個測試、把它印出來的「Received」貼過來即可）之後，這個
// 測試就會恢復綠燈——這是刻意設計成這樣，不是要你永遠不能改 schema。
test('schema definition fingerprint matches SCHEMA_VERSION — bump SCHEMA_VERSION and update this fingerprint together whenever SHEET_HEADERS/TIMESTAMP_COLUMNS/DEFAULT_PERMISSION_ROWS changes', () => {
  const fingerprint = JSON.stringify({ SHEET_HEADERS, TIMESTAMP_COLUMNS, DEFAULT_PERMISSION_ROWS });
  const knownGoodFingerprints = {
    1: '{"SHEET_HEADERS":{"Users":["userId","passwordHash","salt","role","createdAt","loginCount","lastLoginAt","articleCount","replyCount","lastSeenBoards","pendingMentions","credentialVersion"],"Boards":["boardId","boardName","description","sortOrder","latestArticleAt","latestReplyAt","AllowRoles"],"Articles":["articleId","boardId","title","author","content","createdAt","editedAt","editedBy","replyCount","imageUrls"],"Replies":["replyId","articleId","author","content","createdAt"],"Permission":["role","articleRead","articlePost","articleManageOwn","replyRead","replyPost","replyDeleteOwn","leaderboard","login"],"LineGroupBoards":["groupId","groupName","boardId","lastDigestDate","todayDigestCount"],"LineStaging":["groupId","messageTime","displayName","messageType","content","webhookEventId","recalled"],"LineUserId":["userId","displayId"],"AuditLog":["timestamp","actor","action","target","detail"]},"TIMESTAMP_COLUMNS":{"Users":[5,7],"Boards":[5,6],"Articles":[6,7],"Replies":[5],"LineGroupBoards":[4],"LineStaging":[2],"AuditLog":[1]},"DEFAULT_PERMISSION_ROWS":[["newbie",false,false,false,false,false,false,false,true],["user",true,true,true,true,true,true,true,true],["admin",true,true,true,true,true,true,true,true]]}'
  };

  expect(SCHEMA_VERSION in knownGoodFingerprints).toBe(true);
  expect(fingerprint).toBe(knownGoodFingerprints[SCHEMA_VERSION]);
});
