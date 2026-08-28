const { snapshotAllowsBoardArticleRead } = require('../src/permissions');

test('snapshotAllowsBoardArticleRead returns false when the snapshot is null (not logged in / cache miss)', () => {
  expect(snapshotAllowsBoardArticleRead(null, 'gossip')).toBe(false);
});

test('snapshotAllowsBoardArticleRead returns true when articleRead is true and the board is in allowedBoardIds', () => {
  const snapshot = { permissions: { articleRead: true }, allowedBoardIds: ['gossip'] };

  expect(snapshotAllowsBoardArticleRead(snapshot, 'gossip')).toBe(true);
});

test('snapshotAllowsBoardArticleRead returns false when the board is not in allowedBoardIds, even with articleRead true', () => {
  const snapshot = { permissions: { articleRead: true }, allowedBoardIds: ['movie'] };

  expect(snapshotAllowsBoardArticleRead(snapshot, 'gossip')).toBe(false);
});

test('snapshotAllowsBoardArticleRead returns false when articleRead is false, even if the board is listed (unlike snapshotIncludesBoard alone)', () => {
  const snapshot = { permissions: { articleRead: false }, allowedBoardIds: ['gossip'] };

  expect(snapshotAllowsBoardArticleRead(snapshot, 'gossip')).toBe(false);
});
