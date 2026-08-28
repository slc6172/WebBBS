const { truncateToLength } = require('../src/truncateToLength');

// 安全性審查 L4 回歸測試：見 gas-bbs-perf-round-review.md L4。
// harvestGroupDigest_ 用這支函式把組好的標題/內文夾在跟其他發文路徑
// 一致的長度上限內，因為它呼叫的 createArticleUnlockedFor_ 本身刻意不
// 驗證長度。

test('truncateToLength returns the string unchanged when it is within the limit', () => {
  expect(truncateToLength('hello', 10)).toBe('hello');
});

test('truncateToLength returns the string unchanged when it exactly equals the limit', () => {
  expect(truncateToLength('hello', 5)).toBe('hello');
});

test('truncateToLength truncates a string longer than the limit', () => {
  expect(truncateToLength('hello world', 5)).toBe('hello');
});

test('truncateToLength truncates a realistic oversized LINE digest content to ARTICLE_CONTENT_MAX_LENGTH (10000)', () => {
  const oversized = 'x'.repeat(10500);

  const result = truncateToLength(oversized, 10000);

  expect(result.length).toBe(10000);
});

test('truncateToLength truncates a realistic oversized digest title to ARTICLE_TITLE_MAX_LENGTH (100)', () => {
  const oversizedTitle = '2026/08/22' + 'g'.repeat(120) + 'Line群組對話紀錄';

  const result = truncateToLength(oversizedTitle, 100);

  expect(result.length).toBe(100);
});

test('truncateToLength handles an empty string', () => {
  expect(truncateToLength('', 100)).toBe('');
});

test('truncateToLength passes through non-string input unchanged rather than throwing', () => {
  expect(truncateToLength(undefined, 10)).toBe(undefined);
  expect(truncateToLength(null, 10)).toBe(null);
});
