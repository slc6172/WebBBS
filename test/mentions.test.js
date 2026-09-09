const { MAX_PENDING_MENTIONS, extractMentionCandidates_, getPendingMentions_, appendPendingMention_, buildMentionEntry_, recordMentionsForContent_ } = require('../src/mentions');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function seedUserRow(ss, overrides) {
  var row = Object.assign({
    userId: 'bob0002',
    passwordHash: 'h',
    salt: 's',
    role: 'user',
    createdAt: "'2026/07/01 00:00:00",
    loginCount: 0,
    lastLoginAt: '',
    articleCount: 0,
    replyCount: 0,
    lastSeenBoards: '',
    pendingMentions: ''
  }, overrides);
  ss.getSheetByName('Users').appendRow([
    row.userId, row.passwordHash, row.salt, row.role, row.createdAt,
    row.loginCount, row.lastLoginAt, row.articleCount, row.replyCount,
    row.lastSeenBoards, row.pendingMentions
  ]);
}

function seedBoard(ss, overrides) {
  var row = Object.assign({
    boardId: 'gossip', boardName: '八卦板', description: '', sortOrder: 1,
    latestArticleAt: '', latestReplyAt: '', allowRoles: 'ALL'
  }, overrides);
  ss.getSheetByName('Boards').appendRow([
    row.boardId, row.boardName, row.description, row.sortOrder,
    row.latestArticleAt, row.latestReplyAt, row.allowRoles
  ]);
}

function baseParams(overrides) {
  return Object.assign({
    text: '',
    mentionedBy: 'alice01',
    boardId: 'gossip',
    articleId: 'a1',
    articleTitle: '今天天氣真好',
    timestamp: '2026/08/29 10:00:00'
  }, overrides);
}

function getPendingMentionsFor(ss, userId) {
  var rows = ss.getSheetByName('Users').getRange(2, 1, ss.getSheetByName('Users').getLastRow() - 1, 11).getValues();
  var row = rows.find(function (r) { return r[0] === userId; });
  return row ? getPendingMentions_(row[10]) : null;
}

test('a valid mention (existing user, board-readable role) gets appended to the target user\'s pendingMentions', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  seedUserRow(ss, { userId: 'bob0002', role: 'user' });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 你有空嗎' }));

  const pending = getPendingMentionsFor(ss, 'bob0002');
  expect(pending).toEqual([{
    mentionedBy: 'alice01',
    boardId: 'gossip',
    articleId: 'a1',
    articleTitle: '今天天氣真好',
    createdAt: '2026/08/29 10:00:00'
  }]);
});

test('mentioning yourself does not create a notification', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  seedUserRow(ss, { userId: 'alice01', role: 'user' });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@alice01 自言自語', mentionedBy: 'alice01' }));

  expect(getPendingMentionsFor(ss, 'alice01')).toEqual([]);
});

test('mentioning a userId that does not exist is silently skipped, no error thrown', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  const lock = createFakeLock();

  expect(() => {
    recordMentionsForContent_(ss, lock, baseParams({ text: '@nosuchuser 在嗎' }));
  }).not.toThrow();
});

test('an existing user whose role lacks global articleRead is not notified', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  seedUserRow(ss, { userId: 'bob0002', role: 'newbie' }); // newbie: articleRead 預設 false
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 你有空嗎' }));

  expect(getPendingMentionsFor(ss, 'bob0002')).toEqual([]);
});

test('an existing user whose role has global articleRead but this board\'s AllowRoles excludes them is not notified', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, { allowRoles: 'moderator' }); // 只有 moderator 能讀這個看板
  seedUserRow(ss, { userId: 'bob0002', role: 'user' }); // user 全域可讀文章，但這個看板不開放給 user
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 你有空嗎' }));

  expect(getPendingMentionsFor(ss, 'bob0002')).toEqual([]);
});

test('admin is always notified regardless of a board\'s AllowRoles list, matching the existing admin-bypass convention', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, { allowRoles: 'moderator' });
  seedUserRow(ss, { userId: 'root0001', role: 'admin' });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@root0001 麻煩看一下' }));

  expect(getPendingMentionsFor(ss, 'root0001')).toHaveLength(1);
});

test('multiple valid mentions in one text each get their own entry written to their own row', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  seedUserRow(ss, { userId: 'bob0002', role: 'user' });
  seedUserRow(ss, { userId: 'carol003', role: 'user' });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 跟 @carol003 都要來' }));

  expect(getPendingMentionsFor(ss, 'bob0002')).toHaveLength(1);
  expect(getPendingMentionsFor(ss, 'carol003')).toHaveLength(1);
});

test('a new mention is appended without dropping the target user\'s existing pending mentions', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  seedUserRow(ss, {
    userId: 'bob0002',
    role: 'user',
    pendingMentions: JSON.stringify([{ articleId: 'old-one', mentionedBy: 'someone-else' }])
  });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 你有空嗎' }));

  const pending = getPendingMentionsFor(ss, 'bob0002');
  expect(pending).toHaveLength(2);
  expect(pending[0]).toEqual({ articleId: 'old-one', mentionedBy: 'someone-else' });
});

test('extracts a single @userId mention from plain text', () => {
  const result = extractMentionCandidates_('嗨 @alice01 你有空嗎');

  expect(result).toEqual(['alice01']);
});

test('extracts multiple distinct mentions in order of appearance', () => {
  const result = extractMentionCandidates_('@alice01 跟 @bob0002 都要來');

  expect(result).toEqual(['alice01', 'bob0002']);
});

test('the same userId mentioned twice in one text only counts once', () => {
  const result = extractMentionCandidates_('@alice01 你好 @alice01 在嗎');

  expect(result).toEqual(['alice01']);
});

test('text with no @ mentions at all returns an empty array', () => {
  expect(extractMentionCandidates_('完全沒有提及任何人')).toEqual([]);
});

test('empty or falsy text returns an empty array without throwing', () => {
  expect(extractMentionCandidates_('')).toEqual([]);
  expect(extractMentionCandidates_(null)).toEqual([]);
  expect(extractMentionCandidates_(undefined)).toEqual([]);
});

test('a candidate shorter than 4 characters (below the userId minimum length) is not extracted', () => {
  const result = extractMentionCandidates_('email 是 @abc 這種格式嗎');

  expect(result).toEqual([]);
});

test('only the first 20 characters after @ are captured, matching the userId maximum length', () => {
  // userId 上限 20 字元；這裡刻意打一個 25 字元長的英數字字串
  const result = extractMentionCandidates_('@' + 'a'.repeat(25));

  expect(result).toEqual(['a'.repeat(20)]);
});

test('a raw candidate from an email-like address (e.g. someone@example.com) is still extracted as a plain string — downstream existence/permission checks are what actually filter it out, not this function', () => {
  const result = extractMentionCandidates_('請寄信到 someone@example.com 給我');

  expect(result).toEqual(['example']);
});

test('getPendingMentions_ returns an empty array for a falsy or unparseable raw value', () => {
  expect(getPendingMentions_('')).toEqual([]);
  expect(getPendingMentions_(null)).toEqual([]);
  expect(getPendingMentions_(undefined)).toEqual([]);
  expect(getPendingMentions_('not json')).toEqual([]);
  expect(getPendingMentions_('{"not":"an array"}')).toEqual([]);
});

test('getPendingMentions_ parses a previously-stored JSON array back out', () => {
  const stored = JSON.stringify([{ articleId: 'a1' }]);

  expect(getPendingMentions_(stored)).toEqual([{ articleId: 'a1' }]);
});

test('appendPendingMention_ appends one entry onto an empty/falsy existing value', () => {
  const entry = { articleId: 'a1', boardId: 'gossip' };

  const result = appendPendingMention_('', entry);

  expect(JSON.parse(result)).toEqual([entry]);
});

test('appendPendingMention_ appends onto existing entries without dropping them', () => {
  const existing = JSON.stringify([{ articleId: 'a1' }]);
  const newEntry = { articleId: 'a2' };

  const result = appendPendingMention_(existing, newEntry);

  expect(JSON.parse(result)).toEqual([{ articleId: 'a1' }, { articleId: 'a2' }]);
});

test('MAX_PENDING_MENTIONS is 50', () => {
  expect(MAX_PENDING_MENTIONS).toBe(50);
});

test('appendPendingMention_ does not drop anything while at or below the cap', () => {
  // 剛好卡在上限前一筆：append 完剛好等於上限，不該有任何裁切
  const existing = JSON.stringify(
    Array.from({ length: MAX_PENDING_MENTIONS - 1 }, (_, i) => ({ articleId: 'old-' + i }))
  );

  const result = JSON.parse(appendPendingMention_(existing, { articleId: 'new' }));

  expect(result).toHaveLength(MAX_PENDING_MENTIONS);
  expect(result[0]).toEqual({ articleId: 'old-0' }); // 最舊的那筆還在，沒被砍
  expect(result[result.length - 1]).toEqual({ articleId: 'new' });
});

test('appendPendingMention_ silently drops the single oldest entry once appending would exceed the cap', () => {
  const existing = JSON.stringify(
    Array.from({ length: MAX_PENDING_MENTIONS }, (_, i) => ({ articleId: 'old-' + i }))
  );

  const result = JSON.parse(appendPendingMention_(existing, { articleId: 'new' }));

  expect(result).toHaveLength(MAX_PENDING_MENTIONS); // 陣列長度不會超過上限
  expect(result[0]).toEqual({ articleId: 'old-1' }); // old-0（最舊的一筆）被悄悄捨棄
  expect(result[result.length - 1]).toEqual({ articleId: 'new' }); // 新的一筆保留在最後面
});

test('appendPendingMention_ never grows past the cap even when called repeatedly far beyond it', () => {
  let raw = '';
  for (let i = 0; i < MAX_PENDING_MENTIONS + 20; i++) {
    raw = appendPendingMention_(raw, { articleId: 'm' + i });
  }

  const result = JSON.parse(raw);

  expect(result).toHaveLength(MAX_PENDING_MENTIONS);
  // 最新的 MAX_PENDING_MENTIONS 筆應該是索引 20 ~ (MAX_PENDING_MENTIONS + 19)
  expect(result[0]).toEqual({ articleId: 'm20' });
  expect(result[result.length - 1]).toEqual({ articleId: 'm' + (MAX_PENDING_MENTIONS + 19) });
});

test('recordMentionsForContent_ integrated with the cap: a user already at the cap still gets the new mention, with the single oldest entry dropped to make room', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss);
  const alreadyAtCap = JSON.stringify(
    Array.from({ length: MAX_PENDING_MENTIONS }, (_, i) => ({ articleId: 'old-' + i, mentionedBy: 'someone-else' }))
  );
  seedUserRow(ss, { userId: 'bob0002', role: 'user', pendingMentions: alreadyAtCap });
  const lock = createFakeLock();

  recordMentionsForContent_(ss, lock, baseParams({ text: '@bob0002 你有空嗎' }));

  const pending = getPendingMentionsFor(ss, 'bob0002');
  expect(pending).toHaveLength(MAX_PENDING_MENTIONS);
  expect(pending.find(function (e) { return e.articleId === 'old-0'; })).toBeUndefined();
  expect(pending[pending.length - 1]).toMatchObject({ articleId: 'a1', mentionedBy: 'alice01' });
});

test('buildMentionEntry_ shapes the fields the login-time notification list needs', () => {
  const entry = buildMentionEntry_({
    mentionedBy: 'alice01',
    boardId: 'gossip',
    articleId: 'a1',
    articleTitle: '今天天氣真好',
    timestamp: '2026/08/29 10:00:00'
  });

  expect(entry).toEqual({
    mentionedBy: 'alice01',
    boardId: 'gossip',
    articleId: 'a1',
    articleTitle: '今天天氣真好',
    createdAt: '2026/08/29 10:00:00'
  });
});

test('buildMentionEntry_ applies the same formula-injection escaping to articleTitle as postArticle.js applies to title/content/imageUrls — defense in depth for this free-text field embedded in the JSON cell', () => {
  const entry = buildMentionEntry_({
    mentionedBy: 'alice01',
    boardId: 'gossip',
    articleId: 'a1',
    articleTitle: '=cmd|/c calc',
    timestamp: '2026/08/29 10:00:00'
  });

  expect(entry.articleTitle).toBe("'=cmd|/c calc");
});
