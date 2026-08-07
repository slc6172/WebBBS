const { validatePassword } = require('../src/register');

test('validatePassword accepts a password with 6 or more characters', () => {
  expect(validatePassword('abc123')).toEqual({ valid: true });
});

test('validatePassword rejects a password shorter than 6 characters', () => {
  expect(validatePassword('abc12')).toEqual({ valid: false, error: '密碼長度至少需要6碼' });
});
