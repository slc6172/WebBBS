const { hasResidualContent } = require('../src/lineDigestThreshold');

test('hasResidualContent is true when there is any un-harvested content, even below the normal threshold', () => {
  expect(hasResidualContent({ imageCount: 1, contentLength: 0 })).toBe(true);
  expect(hasResidualContent({ imageCount: 0, contentLength: 42 })).toBe(true);
});

test('hasResidualContent is false when there is nothing staged at all', () => {
  expect(hasResidualContent({ imageCount: 0, contentLength: 0 })).toBe(false);
});
