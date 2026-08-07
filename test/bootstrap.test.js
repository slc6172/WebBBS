const { parseBootstrapParams } = require('../src/bootstrap');

test('parseBootstrapParams extracts boardId and articleId from query params', () => {
  const e = { parameter: { board: 'gossip', article: 'abc-123' } };

  expect(parseBootstrapParams(e)).toEqual({ boardId: 'gossip', articleId: 'abc-123' });
});

test('parseBootstrapParams returns an empty object when no query params are present', () => {
  const e = { parameter: {} };

  expect(parseBootstrapParams(e)).toEqual({});
});

test('parseBootstrapParams returns an empty object when e itself is undefined', () => {
  expect(parseBootstrapParams(undefined)).toEqual({});
});
