const { createFakeSpreadsheet } = require('./fakeSpreadsheet');

test('a freshly created sheet reports a read count of 0', () => {
  const ss = createFakeSpreadsheet();
  const sheet = ss.insertSheet('Articles');

  expect(sheet._getReadCount()).toBe(0);
});

test('calling getValues() on a range increments the sheet\'s read count by 1', () => {
  const ss = createFakeSpreadsheet();
  const sheet = ss.insertSheet('Articles');
  sheet.appendRow(['a1', 'gossip']);

  sheet.getRange(1, 1, 1, 2).getValues();

  expect(sheet._getReadCount()).toBe(1);
});

test('repeated getValues() calls accumulate the read count, regardless of range size', () => {
  const ss = createFakeSpreadsheet();
  const sheet = ss.insertSheet('Articles');
  sheet.appendRow(['a1', 'gossip']);
  sheet.appendRow(['a2', 'movie']);

  sheet.getRange(1, 1, 1, 2).getValues();
  sheet.getRange(1, 1, 2, 2).getValues();
  sheet.getRange(2, 1, 1, 2).getValues();

  expect(sheet._getReadCount()).toBe(3);
});

test('calling getRawValues() also increments the read count', () => {
  const ss = createFakeSpreadsheet();
  const sheet = ss.insertSheet('Articles');
  sheet.appendRow(['a1', 'gossip']);

  sheet.getRange(1, 1, 1, 2).getRawValues();

  expect(sheet._getReadCount()).toBe(1);
});

test('write operations (appendRow, setValues, setNumberFormat, setDataValidation) do not increment the read count', () => {
  const ss = createFakeSpreadsheet();
  const sheet = ss.insertSheet('Articles');

  sheet.appendRow(['a1', 'gossip']);
  sheet.getRange(1, 1, 1, 2).setValues([['a1', 'gossip']]);
  sheet.getRange(1, 1, 1, 2).setNumberFormat('@');
  sheet.getRange(1, 1, 1, 2).setDataValidation({ rule: 'x' });

  expect(sheet._getReadCount()).toBe(0);
});

test('different sheets track their read counts independently', () => {
  const ss = createFakeSpreadsheet();
  const articles = ss.insertSheet('Articles');
  const replies = ss.insertSheet('Replies');
  articles.appendRow(['a1', 'gossip']);
  replies.appendRow(['r1', 'a1']);

  articles.getRange(1, 1, 1, 2).getValues();
  articles.getRange(1, 1, 1, 2).getValues();
  replies.getRange(1, 1, 1, 2).getValues();

  expect(articles._getReadCount()).toBe(2);
  expect(replies._getReadCount()).toBe(1);
});
