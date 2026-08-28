const { hasProcessedEvent } = require('../src/lineStaging');

test('hasProcessedEvent returns true when a staging row with the same webhookEventId already exists', () => {
  const rows = [
    { groupId: 'C1', webhookEventId: 'evt-abc' },
    { groupId: 'C1', webhookEventId: 'evt-def' }
  ];

  expect(hasProcessedEvent(rows, 'evt-abc')).toBe(true);
});

test('hasProcessedEvent returns false when no staging row matches the webhookEventId', () => {
  const rows = [
    { groupId: 'C1', webhookEventId: 'evt-abc' }
  ];

  expect(hasProcessedEvent(rows, 'evt-never-seen')).toBe(false);
});
