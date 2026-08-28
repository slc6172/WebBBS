const { compactImageUrls } = require('../src/imageStorage');

test('compactImageUrls drops blank entries, preserving the order of the rest', () => {
  expect(compactImageUrls(['a', '', 'b', '', '', 'c'])).toEqual(['a', 'b', 'c']);
});

test('compactImageUrls returns an empty array when every entry is blank', () => {
  expect(compactImageUrls(['', '', ''])).toEqual([]);
});

test('compactImageUrls returns an empty array for an empty input', () => {
  expect(compactImageUrls([])).toEqual([]);
});

test('compactImageUrls keeps an already-compact array unchanged', () => {
  expect(compactImageUrls(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
});
