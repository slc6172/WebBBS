const { shouldHarvest } = require('../src/lineDigestThreshold');

test('shouldHarvest is true once image count reaches 99, even if content is short', () => {
  expect(shouldHarvest({ imageCount: 99, contentLength: 10 })).toBe(true);
});

test('shouldHarvest is true once content length reaches 8000, even with no images', () => {
  expect(shouldHarvest({ imageCount: 0, contentLength: 8000 })).toBe(true);
});

test('shouldHarvest is false when neither threshold is reached', () => {
  expect(shouldHarvest({ imageCount: 2, contentLength: 7999 })).toBe(false);
});

// ---- 圖片張數突破輪 ticket 05：圖片門檻從 3 放寬到 99 ----

test('shouldHarvest is false when image count is above the old threshold (3) but still below the new one (99)', () => {
  expect(shouldHarvest({ imageCount: 3, contentLength: 10 })).toBe(false);
  expect(shouldHarvest({ imageCount: 50, contentLength: 10 })).toBe(false);
  expect(shouldHarvest({ imageCount: 98, contentLength: 10 })).toBe(false);
});
