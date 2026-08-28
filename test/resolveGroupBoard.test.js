const { resolveGroupBoard } = require('../src/lineGroupBoard');

test('resolveGroupBoard returns authorized with the mapped boardId/groupName when the group is whitelisted', () => {
  const rows = [
    { groupId: 'Cxxxxxxx1', groupName: '晨跑團', boardId: 'sports' },
    { groupId: 'Cxxxxxxx2', groupName: '讀書會', boardId: 'reading' }
  ];

  const result = resolveGroupBoard(rows, 'Cxxxxxxx2');

  expect(result).toEqual({ authorized: true, boardId: 'reading', groupName: '讀書會' });
});

test('resolveGroupBoard returns not authorized when the group is not in the whitelist', () => {
  const rows = [
    { groupId: 'Cxxxxxxx1', groupName: '晨跑團', boardId: 'sports' }
  ];

  const result = resolveGroupBoard(rows, 'Cuninvited');

  expect(result).toEqual({ authorized: false });
});
