const { toSafeDisplayString_ } = require('../src/textCoercion');

test('toSafeDisplayString_ leaves a string value unchanged', () => {
  expect(toSafeDisplayString_('今天天氣真好')).toBe('今天天氣真好');
});

test('toSafeDisplayString_ leaves an empty string unchanged', () => {
  expect(toSafeDisplayString_('')).toBe('');
});

test('toSafeDisplayString_ converts null/undefined to empty string rather than the literal text "null"/"undefined"', () => {
  expect(toSafeDisplayString_(null)).toBe('');
  expect(toSafeDisplayString_(undefined)).toBe('');
});

test('toSafeDisplayString_ converts a Number (e.g. a title that Sheets auto-coerced) to its string form', () => {
  expect(toSafeDisplayString_(12345)).toBe('12345');
});

test('toSafeDisplayString_ converts a Boolean (e.g. a title of "TRUE" that Sheets auto-coerced) to its string form', () => {
  expect(toSafeDisplayString_(true)).toBe('true');
});

test('toSafeDisplayString_ converts a Date object (e.g. a title of "1/2" that Sheets auto-coerced) to a string rather than leaving a Date instance for downstream .toLowerCase() calls to choke on', () => {
  const result = toSafeDisplayString_(new Date('2026-01-02T00:00:00Z'));
  expect(typeof result).toBe('string');
});
