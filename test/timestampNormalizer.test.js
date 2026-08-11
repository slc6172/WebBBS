const { isCanonicalTimestamp, parseLooseTimestamp, formatCanonicalTimestamp } = require('../src/timestampNormalizer');

// ---- isCanonicalTimestamp ----

test('isCanonicalTimestamp accepts the exact yyyy/MM/dd HH:mm:ss format our own code writes', () => {
  expect(isCanonicalTimestamp('2026/08/01 09:30:58')).toBe(true);
});

test('isCanonicalTimestamp rejects dash-separated format even if otherwise zero-padded', () => {
  expect(isCanonicalTimestamp('1996-03-05 03:01:50')).toBe(false);
});

test('isCanonicalTimestamp rejects an unpadded hour even with the right slash separator', () => {
  expect(isCanonicalTimestamp('2026/08/01 9:30:58')).toBe(false);
});

test('isCanonicalTimestamp rejects non-string input', () => {
  expect(isCanonicalTimestamp(new Date())).toBe(false);
  expect(isCanonicalTimestamp(null)).toBe(false);
  expect(isCanonicalTimestamp(undefined)).toBe(false);
});

// ---- parseLooseTimestamp ----

test('parseLooseTimestamp parses a dash-separated, unpadded-hour timestamp (the imported-data shape)', () => {
  const result = parseLooseTimestamp('1996-03-05 3:01:50');
  expect(result.getFullYear()).toBe(1996);
  expect(result.getMonth()).toBe(2); // 0-indexed: March
  expect(result.getDate()).toBe(5);
  expect(result.getHours()).toBe(3);
  expect(result.getMinutes()).toBe(1);
  expect(result.getSeconds()).toBe(50);
});

test('parseLooseTimestamp also accepts the already-canonical slash format', () => {
  const result = parseLooseTimestamp('2026/08/01 09:30:58');
  expect(result.getFullYear()).toBe(2026);
  expect(result.getHours()).toBe(9);
});

test('parseLooseTimestamp passes a Date object straight through unchanged', () => {
  const d = new Date(2020, 0, 1);
  expect(parseLooseTimestamp(d)).toBe(d);
});

test('parseLooseTimestamp returns null for an invalid Date object', () => {
  expect(parseLooseTimestamp(new Date('not a date'))).toBeNull();
});

test('parseLooseTimestamp returns null for garbage, empty, or missing input', () => {
  expect(parseLooseTimestamp('not a date')).toBeNull();
  expect(parseLooseTimestamp('')).toBeNull();
  expect(parseLooseTimestamp('   ')).toBeNull();
  expect(parseLooseTimestamp(null)).toBeNull();
  expect(parseLooseTimestamp(undefined)).toBeNull();
});

test('parseLooseTimestamp rejects an out-of-range day rather than letting JS silently roll it over into the next month', () => {
  expect(parseLooseTimestamp('1996-02-30 12:00:00')).toBeNull(); // February never has 30 days
});

// ---- formatCanonicalTimestamp ----

test('formatCanonicalTimestamp zero-pads month/day/hour/minute/second', () => {
  const d = new Date(1996, 2, 5, 3, 1, 50); // 1996-03-05 03:01:50
  expect(formatCanonicalTimestamp(d)).toBe('1996/03/05 03:01:50');
});

test('formatCanonicalTimestamp does not add extra zero-padding when values are already two digits', () => {
  const d = new Date(2026, 7, 1, 9, 30, 58); // 2026-08-01 09:30:58
  expect(formatCanonicalTimestamp(d)).toBe('2026/08/01 09:30:58');
});

// ---- round trip: this is the actual bug fix ----

test('round trip: an unpadded imported timestamp reformats to the exact canonical form', () => {
  const parsed = parseLooseTimestamp('1996-03-05 3:01:50');
  expect(formatCanonicalTimestamp(parsed)).toBe('1996/03/05 03:01:50');
});

test('round trip: two same-day timestamps that sort WRONG as raw strings sort CORRECTLY after normalization', () => {
  // "4:47:08" > "18:16:10" as raw strings (since '4' > '1'), even though 4am is earlier than 6pm.
  const earlyMorning = formatCanonicalTimestamp(parseLooseTimestamp('1996-03-01 4:47:08'));
  const evening = formatCanonicalTimestamp(parseLooseTimestamp('1996-03-01 18:16:10'));
  expect(earlyMorning < evening).toBe(true);
});
