// Minimal stand-in for the LockService.Lock interface. Real concurrency
// (two requests racing) is out of scope for these unit tests per the
// spec's Testing Decisions — this fake just grants immediately so
// registerUser's check-then-write logic can be exercised deterministically.

function createFakeLock() {
  return {
    waitLock: function () {},
    releaseLock: function () {}
  };
}

module.exports = { createFakeLock: createFakeLock };
