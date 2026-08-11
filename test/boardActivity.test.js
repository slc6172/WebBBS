const { getLastSeenBoards, updateLastSeenBoard, getBoardNewContentStatus } = require('../src/boardActivity');

// ---- getLastSeenBoards ----

test('getLastSeenBoards parses a valid JSON blob into an object', () => {
  expect(getLastSeenBoards('{"gossip":"2026/08/05 10:00:00","movie":"2026/08/01 09:00:00"}')).toEqual({
    gossip: '2026/08/05 10:00:00',
    movie: '2026/08/01 09:00:00'
  });
});

test('getLastSeenBoards returns an empty object for blank/null/undefined input (never visited any board)', () => {
  expect(getLastSeenBoards('')).toEqual({});
  expect(getLastSeenBoards(null)).toEqual({});
  expect(getLastSeenBoards(undefined)).toEqual({});
});

test('getLastSeenBoards returns an empty object for corrupted JSON rather than throwing', () => {
  expect(getLastSeenBoards('{not valid json')).toEqual({});
});

test('getLastSeenBoards returns an empty object when the JSON parses to something that is not an object (e.g. an array or number)', () => {
  expect(getLastSeenBoards('[1,2,3]')).toEqual({});
  expect(getLastSeenBoards('42')).toEqual({});
});

// ---- updateLastSeenBoard ----

test('updateLastSeenBoard creates a fresh entry when starting from a blank cell', () => {
  const result = updateLastSeenBoard('', 'gossip', '2026/08/05 10:00:00');
  expect(JSON.parse(result)).toEqual({ gossip: '2026/08/05 10:00:00' });
});

test('updateLastSeenBoard adds a new board entry while preserving existing ones', () => {
  const existing = '{"gossip":"2026/08/01 09:00:00"}';
  const result = updateLastSeenBoard(existing, 'movie', '2026/08/05 10:00:00');
  expect(JSON.parse(result)).toEqual({
    gossip: '2026/08/01 09:00:00',
    movie: '2026/08/05 10:00:00'
  });
});

test('updateLastSeenBoard overwrites the timestamp for a board that already has an entry', () => {
  const existing = '{"gossip":"2026/08/01 09:00:00"}';
  const result = updateLastSeenBoard(existing, 'gossip', '2026/08/06 15:00:00');
  expect(JSON.parse(result)).toEqual({ gossip: '2026/08/06 15:00:00' });
});

test('updateLastSeenBoard recovers gracefully from a corrupted existing cell (starts fresh instead of throwing)', () => {
  const result = updateLastSeenBoard('{corrupted', 'gossip', '2026/08/05 10:00:00');
  expect(JSON.parse(result)).toEqual({ gossip: '2026/08/05 10:00:00' });
});

// ---- getBoardNewContentStatus ----

test('a board the user has never seen shows new-article/new-reply whenever the board has any activity timestamp', () => {
  const status = getBoardNewContentStatus({}, [
    { boardId: 'gossip', latestArticleAt: '2026/08/05 10:00:00', latestReplyAt: '2026/08/06 15:00:00' }
  ]);
  expect(status.gossip).toEqual({ hasNewArticle: true, hasNewReply: true });
});

test('a board the user has never seen shows no indicator when the board has never had any article or reply', () => {
  const status = getBoardNewContentStatus({}, [
    { boardId: 'empty-board', latestArticleAt: '', latestReplyAt: '' }
  ]);
  expect(status['empty-board']).toEqual({ hasNewArticle: false, hasNewReply: false });
});

test('a board seen AFTER the latest article/reply shows no indicator', () => {
  const lastSeen = { gossip: '2026/08/10 00:00:00' };
  const status = getBoardNewContentStatus(lastSeen, [
    { boardId: 'gossip', latestArticleAt: '2026/08/05 10:00:00', latestReplyAt: '2026/08/06 15:00:00' }
  ]);
  expect(status.gossip).toEqual({ hasNewArticle: false, hasNewReply: false });
});

test('a board seen BEFORE the latest article but after the latest reply only flags the new article', () => {
  const lastSeen = { gossip: '2026/08/06 00:00:00' };
  const status = getBoardNewContentStatus(lastSeen, [
    { boardId: 'gossip', latestArticleAt: '2026/08/07 10:00:00', latestReplyAt: '2026/08/01 15:00:00' }
  ]);
  expect(status.gossip).toEqual({ hasNewArticle: true, hasNewReply: false });
});

test('multiple boards are evaluated independently', () => {
  const lastSeen = { gossip: '2026/08/10 00:00:00' }; // movie never seen
  const status = getBoardNewContentStatus(lastSeen, [
    { boardId: 'gossip', latestArticleAt: '2026/08/05 10:00:00', latestReplyAt: '' },
    { boardId: 'movie', latestArticleAt: '2026/08/05 10:00:00', latestReplyAt: '' }
  ]);
  expect(status.gossip.hasNewArticle).toBe(false); // seen after
  expect(status.movie.hasNewArticle).toBe(true);   // never seen
});
