const { markRecalled } = require('../src/lineStaging');

test('markRecalled marks the matching row as recalled while keeping its original content', () => {
  const rows = [
    { groupId: 'C1', webhookEventId: 'evt-abc', content: '晚上一起吃飯嗎？', recalled: false },
    { groupId: 'C1', webhookEventId: 'evt-def', content: '好啊', recalled: false }
  ];

  const result = markRecalled(rows, 'evt-abc');

  expect(result).toEqual([
    { groupId: 'C1', webhookEventId: 'evt-abc', content: '晚上一起吃飯嗎？', recalled: true },
    { groupId: 'C1', webhookEventId: 'evt-def', content: '好啊', recalled: false }
  ]);
});

test('markRecalled returns the rows unchanged when no row matches the webhookEventId (already harvested and deleted)', () => {
  const rows = [
    { groupId: 'C1', webhookEventId: 'evt-abc', content: '晚上一起吃飯嗎？', recalled: false }
  ];

  const result = markRecalled(rows, 'evt-already-gone');

  expect(result).toEqual([
    { groupId: 'C1', webhookEventId: 'evt-abc', content: '晚上一起吃飯嗎？', recalled: false }
  ]);
});
