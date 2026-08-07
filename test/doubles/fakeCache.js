// Minimal stand-in for CacheService.getScriptCache(). Real expiration
// (values disappearing after N seconds) is a GAS-runtime behavior we
// can't reproduce in Node without a fake clock, and per the spec's
// Testing Decisions the 15-minute lockout window itself is verified
// manually, not by unit tests — this fake just stores values in memory
// with no TTL, so we can exercise the counting/reset logic.

function createFakeCache() {
  var store = {};
  return {
    get: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    put: function (key, value) {
      store[key] = value;
    },
    remove: function (key) {
      delete store[key];
    }
  };
}

module.exports = { createFakeCache: createFakeCache };
