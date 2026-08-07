const { hashPassword } = require('../src/register');

// A deterministic fake standing in for Utilities.computeDigest, which
// only exists inside the Apps Script runtime. We're not testing whether
// SHA-256 itself is correct (that's Google's responsibility) — we're
// testing that hashPassword combines password+salt through the digest
// function correctly and consistently.
function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

test('hashPassword returns the same hash for the same password and salt', () => {
  const hash1 = hashPassword('secret123', 'saltA', fakeDigest);
  const hash2 = hashPassword('secret123', 'saltA', fakeDigest);

  expect(hash1).toBe(hash2);
});

test('hashPassword returns different hashes for different passwords with the same salt', () => {
  const hashA = hashPassword('secret123', 'saltA', fakeDigest);
  const hashB = hashPassword('different', 'saltA', fakeDigest);

  expect(hashA).not.toBe(hashB);
});

test('hashPassword returns different hashes for the same password with different salts', () => {
  const hashA = hashPassword('secret123', 'saltA', fakeDigest);
  const hashB = hashPassword('secret123', 'saltB', fakeDigest);

  expect(hashA).not.toBe(hashB);
});
