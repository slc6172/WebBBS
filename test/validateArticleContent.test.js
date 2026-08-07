const { validateArticleContent } = require('../src/postArticle');

test('validateArticleContent accepts a non-empty content within 10000 characters', () => {
  expect(validateArticleContent('這是內文')).toEqual({ valid: true });
});

test('validateArticleContent rejects empty content', () => {
  expect(validateArticleContent('')).toEqual({ valid: false, error: '內文不能為空' });
});

test('validateArticleContent rejects content longer than 10000 characters', () => {
  expect(validateArticleContent('a'.repeat(10001))).toEqual({ valid: false, error: '內文長度不能超過10000字元' });
});
