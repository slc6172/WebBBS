const { verifyPassword } = require('../src/login');
const { hashPassword } = require('../src/register');

function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

test('verifyPassword returns true when the candidate password matches the stored hash', () => {
  const storedHash = hashPassword('correct-password', 'salt1', fakeDigest);

  expect(verifyPassword(storedHash, 'salt1', 'correct-password', fakeDigest)).toBe(true);
});

test('verifyPassword returns false when the candidate password does not match', () => {
  const storedHash = hashPassword('correct-password', 'salt1', fakeDigest);

  expect(verifyPassword(storedHash, 'salt1', 'wrong-password', fakeDigest)).toBe(false);
});
