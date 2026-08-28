const { putSessionSnapshot, getSessionSnapshot, removeSessionSnapshot, SESSION_PREFIX } = require('../src/login');
const { createFakeCache } = require('./doubles/fakeCache');

test('getSessionSnapshot returns null when nothing has been stored for this token', () => {
  const cache = createFakeCache();

  expect(getSessionSnapshot(cache, 'tok1')).toBe(null);
});

test('putSessionSnapshot then getSessionSnapshot round-trips the same object', () => {
  const cache = createFakeCache();
  const snapshot = { permissions: { articleRead: true, articlePost: false }, allowedBoardIds: ['gossip', 'movie'] };

  putSessionSnapshot(cache, 'tok1', snapshot);

  expect(getSessionSnapshot(cache, 'tok1')).toEqual(snapshot);
});

test('removeSessionSnapshot clears a previously stored snapshot', () => {
  const cache = createFakeCache();
  putSessionSnapshot(cache, 'tok1', { permissions: {}, allowedBoardIds: [] });

  removeSessionSnapshot(cache, 'tok1');

  expect(getSessionSnapshot(cache, 'tok1')).toBe(null);
});

test('the snapshot keyspace is independent of SESSION_PREFIX\'s own userId keyspace, even for the same token', () => {
  const cache = createFakeCache();
  cache.put(SESSION_PREFIX + 'tok1', 'alice01');
  putSessionSnapshot(cache, 'tok1', { permissions: { articleRead: true }, allowedBoardIds: ['gossip'] });

  expect(cache.get(SESSION_PREFIX + 'tok1')).toBe('alice01');
  expect(getSessionSnapshot(cache, 'tok1')).toEqual({ permissions: { articleRead: true }, allowedBoardIds: ['gossip'] });
});
