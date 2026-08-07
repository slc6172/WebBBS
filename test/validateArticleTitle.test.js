const { validateArticleTitle } = require('../src/postArticle');

test('validateArticleTitle accepts a non-empty title within 100 characters', () => {
  expect(validateArticleTitle('今天天氣真好')).toEqual({ valid: true });
});

test('validateArticleTitle rejects an empty title', () => {
  expect(validateArticleTitle('')).toEqual({ valid: false, error: '標題不能為空' });
});

test('validateArticleTitle rejects a title longer than 100 characters', () => {
  expect(validateArticleTitle('a'.repeat(101))).toEqual({ valid: false, error: '標題長度不能超過100字元' });
});
