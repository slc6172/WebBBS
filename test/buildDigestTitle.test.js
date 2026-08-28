const { buildDigestTitle } = require('../src/lineArticleTitle');

test('buildDigestTitle always includes the group name and a sequence suffix, even for the first article of the day', () => {
  const title = buildDigestTitle({
    date: '2026/08/15',
    groupName: '晨跑團',
    sequenceNumber: 1
  });

  expect(title).toBe('2026/08/15晨跑團Line群組對話紀錄(第1篇)');
});

test('buildDigestTitle uses the correct sequence number for the 2nd+ article of the day', () => {
  const title = buildDigestTitle({
    date: '2026/08/15',
    groupName: '晨跑團',
    sequenceNumber: 2
  });

  expect(title).toBe('2026/08/15晨跑團Line群組對話紀錄(第2篇)');
});

test('buildDigestTitle keeps working with a double-digit sequence number', () => {
  const title = buildDigestTitle({
    date: '2026/08/15',
    groupName: '晨跑團',
    sequenceNumber: 12
  });

  expect(title).toBe('2026/08/15晨跑團Line群組對話紀錄(第12篇)');
});
