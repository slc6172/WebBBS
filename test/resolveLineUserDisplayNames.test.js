const { resolveLineUserDisplayNames } = require('../src/lineUserId');

test('resolveLineUserDisplayNames uses the admin-maintained displayId when the userId is already registered', () => {
  const rows = [
    { userId: 'U111', displayId: '小明' },
    { userId: 'U222', displayId: '小華' }
  ];

  const result = resolveLineUserDisplayNames(rows, ['U111']);

  expect(result).toEqual({
    displayNameByUserId: { U111: '小明' },
    newRows: []
  });
});

test('resolveLineUserDisplayNames falls back to the userId itself and queues a default row when the userId is not yet registered', () => {
  const result = resolveLineUserDisplayNames([], ['Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { Unew1: 'Unew1' },
    newRows: [{ userId: 'Unew1', displayId: 'Unew1' }]
  });
});

test('resolveLineUserDisplayNames de-duplicates repeated userIds in the same batch, queuing only one new row', () => {
  const result = resolveLineUserDisplayNames([], ['Unew1', 'Unew1', 'Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { Unew1: 'Unew1' },
    newRows: [{ userId: 'Unew1', displayId: 'Unew1' }]
  });
});

test('resolveLineUserDisplayNames skips empty/falsy userIds entirely', () => {
  const result = resolveLineUserDisplayNames([], ['', null, undefined]);

  expect(result).toEqual({
    displayNameByUserId: {},
    newRows: []
  });
});

test('resolveLineUserDisplayNames handles a mix of registered and unregistered userIds in one batch', () => {
  const rows = [{ userId: 'U111', displayId: '小明' }];

  const result = resolveLineUserDisplayNames(rows, ['U111', 'Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { U111: '小明', Unew1: 'Unew1' },
    newRows: [{ userId: 'Unew1', displayId: 'Unew1' }]
  });
});
