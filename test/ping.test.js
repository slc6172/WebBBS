const { pingRoundTrip } = require('../src/ping');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

test('pingRoundTrip writes a value and reads back the same value', () => {
  const ss = createFakeSpreadsheet();

  const result = pingRoundTrip(ss, 'hello-ping-123');

  expect(result).toBe('hello-ping-123');
});

test('pingRoundTrip creates its own sheet on first use, separate from the BBS data sheets', () => {
  const ss = createFakeSpreadsheet();
  expect(ss.getSheetByName('Users')).toBeNull();

  pingRoundTrip(ss, 'value');

  expect(ss.getSheetByName('Users')).toBeNull();
});
