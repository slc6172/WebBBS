const { validateImageCount, MAX_IMAGES_PER_ARTICLE } = require('../src/imageStorage');

test('MAX_IMAGES_PER_ARTICLE is 99', () => {
  expect(MAX_IMAGES_PER_ARTICLE).toBe(99);
});

test('validateImageCount accepts a count at or below the limit', () => {
  expect(validateImageCount(99)).toEqual({ valid: true });
  expect(validateImageCount(0)).toEqual({ valid: true });
});

test('validateImageCount rejects a count above the limit', () => {
  expect(validateImageCount(100)).toEqual({ valid: false, error: '圖片數量超過上限' });
});
