const { excludeRecalled } = require('../src/lineStaging');

test('excludeRecalled drops rows marked as recalled, keeping the rest in order', () => {
  const rows = [
    { webhookEventId: 'evt-1', content: '晚上一起吃飯嗎？', recalled: false },
    { webhookEventId: 'evt-2', content: '算了當我沒說', recalled: true },
    { webhookEventId: 'evt-3', content: '好啊', recalled: false }
  ];

  const result = excludeRecalled(rows);

  expect(result).toEqual([
    { webhookEventId: 'evt-1', content: '晚上一起吃飯嗎？', recalled: false },
    { webhookEventId: 'evt-3', content: '好啊', recalled: false }
  ]);
});

test('excludeRecalled returns an empty array when every row was recalled', () => {
  const rows = [
    { webhookEventId: 'evt-1', content: 'x', recalled: true },
    { webhookEventId: 'evt-2', content: 'y', recalled: true }
  ];

  expect(excludeRecalled(rows)).toEqual([]);
});

test('excludeRecalled returns the rows unchanged when none were recalled', () => {
  const rows = [
    { webhookEventId: 'evt-1', content: 'x', recalled: false }
  ];

  expect(excludeRecalled(rows)).toEqual(rows);
});

test('excludeRecalled treats a missing/undefined input as an empty array', () => {
  expect(excludeRecalled(undefined)).toEqual([]);
});
