const { snapshotIncludesBoard } = require('../src/permissions');

test('snapshotIncludesBoard returns false when the snapshot is null (not logged in / cache miss)', () => {
  expect(snapshotIncludesBoard(null, 'gossip')).toBe(false);
});

test('snapshotIncludesBoard returns true when the boardId is in allowedBoardIds', () => {
  const snapshot = { permissions: { articleRead: true }, allowedBoardIds: ['gossip', 'movie'] };

  expect(snapshotIncludesBoard(snapshot, 'gossip')).toBe(true);
});

test('snapshotIncludesBoard returns false when the boardId is not in allowedBoardIds', () => {
  const snapshot = { permissions: { articleRead: true }, allowedBoardIds: ['movie'] };

  expect(snapshotIncludesBoard(snapshot, 'gossip')).toBe(false);
});

test('snapshotIncludesBoard does not care about any permission flag — it is a pure membership check, callers AND it with whichever flag they need', () => {
  // articleRead is false here, but the board is still "included" — a
  // replyRead-only caller (getArticleDetailForSnapshot's replies gate)
  // needs this to stay true; it does its own separate AND with replyRead.
  const snapshot = { permissions: { articleRead: false, replyRead: true }, allowedBoardIds: ['gossip'] };

  expect(snapshotIncludesBoard(snapshot, 'gossip')).toBe(true);
});
