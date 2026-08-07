const { gateByRole } = require('../src/permissions');

test('gateByRole allows a role that is in the allowed list', () => {
  expect(gateByRole('user', ['user', 'admin'])).toBe(true);
});

test('gateByRole rejects newbie when it is not in the allowed list', () => {
  expect(gateByRole('newbie', ['user', 'admin'])).toBe(false);
});

test('gateByRole rejects a null role (not logged in)', () => {
  expect(gateByRole(null, ['user', 'admin'])).toBe(false);
});
