const { validateUserId } = require('../src/register');

test('validateUserId accepts an id made of letters, numbers, and underscores within 4-20 chars', () => {
  expect(validateUserId('user_01')).toEqual({ valid: true });
});

test('validateUserId rejects an id shorter than 4 characters', () => {
  expect(validateUserId('abc')).toEqual({ valid: false, error: 'userId 長度需為 4~20 字元' });
});

test('validateUserId rejects an id longer than 20 characters', () => {
  expect(validateUserId('a'.repeat(21))).toEqual({ valid: false, error: 'userId 長度需為 4~20 字元' });
});

test('validateUserId rejects an id containing characters other than letters, numbers, and underscores', () => {
  expect(validateUserId('user-01')).toEqual({ valid: false, error: 'userId 只能包含英數字與底線' });
});
