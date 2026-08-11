// Minimal stand-in for PropertiesService.getScriptProperties().

function createFakeProperties() {
  var store = {};
  return {
    get: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    set: function (key, value) {
      store[key] = value;
    }
  };
}

module.exports = { createFakeProperties: createFakeProperties };
