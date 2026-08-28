const { deleteReplyForRole } = require('../src/deleteReply');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 1
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount]);
}

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

function seedBoard(ss, row) {
  ss.getSheetByName('Boards').appendRow(row);
}

test('deleteReplyForRole deletes the reply when role is admin, ignoring AllowRoles entirely and not requiring ownership', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']); // blank — nobody but admin
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'admin', 'admin01', 'a1', 'r1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('deleteReplyForRole reads the Articles sheet at most once per call, for admin too', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', '']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  deleteReplyForRole(ss, lock, 'admin', 'admin01', 'a1', 'r1');

  expect(ss.getSheetByName('Articles')._getReadCount()).toBeLessThanOrEqual(1);
});

test('deleteReplyForRole rejects newbie and deletes nothing, even for the reply owner', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'newbie', 'bob02', 'a1', 'r1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteReplyForRole lets a role with replyDeleteOwn delete its own reply when the board\'s AllowRoles allows it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'user', 'bob02', 'a1', 'r1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
});

test('deleteReplyForRole rejects a role with replyDeleteOwn trying to delete someone else\'s reply', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'user', 'carol03', 'a1', 'r1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteReplyForRole rejects a role with replyDeleteOwn when the article\'s board AllowRoles excludes it, even for its own reply', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'admin']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'user', 'bob02', 'a1', 'r1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteReplyForRole rejects a role without replyDeleteOwn even for its own reply, even though the board\'s AllowRoles would allow it', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'carol03' });
  ss.getSheetByName('Permission').appendRow(
    ['post-only', true, true, false, true, true, false, false, true]
  );
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'post-only', 'carol03', 'a1', 'r1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteReplyForRole reads the Articles sheet at most once per call, for a non-admin role', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), {});
  seedReply(ss.getSheetByName('Replies'), { author: 'bob02' });
  const lock = createFakeLock();

  deleteReplyForRole(ss, lock, 'user', 'bob02', 'a1', 'r1');

  expect(ss.getSheetByName('Articles')._getReadCount()).toBeLessThanOrEqual(1);
});

// 安全性審查 H2 回歸測試組：見 gas-bbs-perf-round-review.md H2。核心情境
// 是「用一篇自己有權限看板的 articleId，搭配自己在另一個沒有權限的看板
// 寫的 replyId」，修復前這樣可以繞過 boardAllowsRoleByIdFor_ 的看板層級
// 閘門，因為閘門判斷用的是客戶端傳入的 articleId（有權限的那個），而不是
// replyId 實際所屬的文章。

test('deleteReplyForRole rejects when articleId belongs to an accessible board but replyId actually belongs to a different, inaccessible board (IDOR regression)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']); // bob02 有權限
  seedBoard(ss, ['secret', '私密板', '閒聊', 2, '', '', 'admin']); // bob02 沒有權限，只有 admin
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a-gossip', boardId: 'gossip', replyCount: 0 });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a-secret', boardId: 'secret', replyCount: 1 });
  // bob02 自己在 secret 板寫的回覆（例如被排除在 AllowRoles 之前發的）
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a-secret', author: 'bob02' });
  const lock = createFakeLock();

  // 攻擊：宣稱 articleId 是自己有權限的 gossip 板文章，但 replyId 其實屬於 secret 板。
  const result = deleteReplyForRole(ss, lock, 'user', 'bob02', 'a-gossip', 'r1');

  expect(result).toEqual({ success: false, error: '回覆與文章不符' });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // 回覆沒被刪
  const secretReplyCount = ss.getSheetByName('Articles').getRange(3, 9, 1, 1).getValues()[0][0];
  expect(secretReplyCount).toBe(1); // replyCount 沒有被錯誤地扣在任何文章上
});

test('deleteReplyForRole still succeeds, with unchanged read counts, when articleId and replyId correctly match', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedBoard(ss, ['gossip', '八卦板', '閒聊', 1, '', '', 'ALL']);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', replyCount: 1 });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1', author: 'bob02' });
  const lock = createFakeLock();

  const result = deleteReplyForRole(ss, lock, 'user', 'bob02', 'a1', 'r1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(1);
  expect(ss.getSheetByName('Articles')._getReadCount()).toBeLessThanOrEqual(1);
});
