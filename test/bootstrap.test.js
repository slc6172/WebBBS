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

test('parseBootstrapParams accepts boardId values containing hyphens (real board slugs use them)', () => {
  const e = { parameter: { board: 'secret-board', article: 'not-a-real-board' } };

  expect(parseBootstrapParams(e)).toEqual({ boardId: 'secret-board', articleId: 'not-a-real-board' });
});

test('parseBootstrapParams accepts a real UUID-shaped articleId', () => {
  const e = { parameter: { article: '3fa4c1a0-9b7e-4f1a-8c2d-1a2b3c4d5e6f' } };

  expect(parseBootstrapParams(e)).toEqual({ articleId: '3fa4c1a0-9b7e-4f1a-8c2d-1a2b3c4d5e6f' });
});

// 安全性審查 H1 回歸測試：這些輸入如果沒被擋下，會被 doGet() 透過
// JSON.stringify 原樣塞進 Index.html 的 <script> 區塊，可能提前關閉
// script 標籤、注入任意 JS（見 gas-bbs-perf-round-review.md H1）。
test('parseBootstrapParams drops a boardId containing a script-closing payload', () => {
  const e = { parameter: { board: '</script><script>alert(1)</script>' } };

  expect(parseBootstrapParams(e)).toEqual({});
});

test('parseBootstrapParams drops an articleId containing a script-closing payload', () => {
  const e = { parameter: { article: '</script><script>alert(document.domain)</script>' } };

  expect(parseBootstrapParams(e)).toEqual({});
});

test('parseBootstrapParams drops values containing quotes, angle brackets, or other non-whitelisted characters', () => {
  const e = { parameter: { board: 'a"b', article: 'a<b>c' } };

  expect(parseBootstrapParams(e)).toEqual({});
});

test('parseBootstrapParams keeps a valid boardId even when articleId is malicious, and vice versa', () => {
  const e1 = { parameter: { board: 'gossip', article: '</script>' } };
  expect(parseBootstrapParams(e1)).toEqual({ boardId: 'gossip' });

  const e2 = { parameter: { board: '</script>', article: 'abc-123' } };
  expect(parseBootstrapParams(e2)).toEqual({ articleId: 'abc-123' });
});
