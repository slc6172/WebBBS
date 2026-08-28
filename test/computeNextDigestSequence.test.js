const { computeNextDigestSequence } = require('../src/lineGroupBoard');

test('computeNextDigestSequence increments todayDigestCount when lastDigestDate is still today', () => {
  const result = computeNextDigestSequence('2026/08/15', 1, '2026/08/15');
  expect(result).toBe(2);
});

test('computeNextDigestSequence resets to 1 when the date has rolled over', () => {
  const result = computeNextDigestSequence('2026/08/14', 3, '2026/08/15');
  expect(result).toBe(1);
});

test('computeNextDigestSequence resets to 1 the very first time (lastDigestDate is empty)', () => {
  const result = computeNextDigestSequence('', 0, '2026/08/15');
  expect(result).toBe(1);
});
