const { boardAllowsRole } = require('../src/boards');

test('boardAllowsRole denies everyone when AllowRoles is blank', () => {
  expect(boardAllowsRole('', 'user')).toBe(false);
  expect(boardAllowsRole(null, 'user')).toBe(false);
  expect(boardAllowsRole(undefined, 'admin')).toBe(false);
});

test('boardAllowsRole allows any role when AllowRoles is "ALL", case-insensitively', () => {
  expect(boardAllowsRole('ALL', 'user')).toBe(true);
  expect(boardAllowsRole('all', 'newbie')).toBe(true);
  expect(boardAllowsRole('All', 'reject')).toBe(true);
});

test('boardAllowsRole allows only roles present in a comma-separated list', () => {
  expect(boardAllowsRole('user,admin', 'user')).toBe(true);
  expect(boardAllowsRole('user,admin', 'admin')).toBe(true);
  expect(boardAllowsRole('user,admin', 'newbie')).toBe(false);
});

test('boardAllowsRole trims whitespace around comma-separated role names', () => {
  expect(boardAllowsRole('user, admin , reject', 'admin')).toBe(true);
  expect(boardAllowsRole(' user ,admin', 'user')).toBe(true);
});

test('boardAllowsRole treats a single role name (no comma) the same as a one-item list', () => {
  expect(boardAllowsRole('user', 'user')).toBe(true);
  expect(boardAllowsRole('user', 'admin')).toBe(false);
});
