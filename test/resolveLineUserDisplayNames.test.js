const { resolveLineUserDisplayNames } = require('../src/lineUserId');

test('resolveLineUserDisplayNames uses the admin-maintained displayId when the userId is already registered', () => {
  const rows = [
    { userId: 'U111', displayId: '小明' },
    { userId: 'U222', displayId: '小華' }
  ];

  const result = resolveLineUserDisplayNames(rows, ['U111']);

  expect(result).toEqual({
    displayNameByUserId: { U111: '小明' },
    newRows: []
  });
});

test('resolveLineUserDisplayNames falls back to the userId itself for display, and queues a default row (escaped for the sheet write) when the userId is not yet registered', () => {
  const result = resolveLineUserDisplayNames([], ['Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { Unew1: 'Unew1' },
    newRows: [{ userId: "'Unew1", displayId: "'Unew1" }]
  });
});

test('resolveLineUserDisplayNames de-duplicates repeated userIds in the same batch, queuing only one new row', () => {
  const result = resolveLineUserDisplayNames([], ['Unew1', 'Unew1', 'Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { Unew1: 'Unew1' },
    newRows: [{ userId: "'Unew1", displayId: "'Unew1" }]
  });
});

test('resolveLineUserDisplayNames skips empty/falsy userIds entirely', () => {
  const result = resolveLineUserDisplayNames([], ['', null, undefined]);

  expect(result).toEqual({
    displayNameByUserId: {},
    newRows: []
  });
});

test('resolveLineUserDisplayNames handles a mix of registered and unregistered userIds in one batch', () => {
  const rows = [{ userId: 'U111', displayId: '小明' }];

  const result = resolveLineUserDisplayNames(rows, ['U111', 'Unew1']);

  expect(result).toEqual({
    displayNameByUserId: { U111: '小明', Unew1: 'Unew1' },
    newRows: [{ userId: "'Unew1", displayId: "'Unew1" }]
  });
});

// `/mycr` 深層複掃 Finding 2 的迴歸測試：webhook 本身沒有簽章驗證（見
// verifyWebhookDestination.js 的 M3 說明），M3 的前提一旦被突破，
// event.source.userId 理論上可以是任意字串。這裡驗證「新登記」分支寫進
// newRows 的值，會套用跟 buildLineStagingRow 一致的 escapeFormulaInjection，
// 不會讓一個以 =/+/-/@ 開頭的偽造 userId 原封不動寫進 LineUserId 工作表。
//
// mycr 第 15 輪票 05：displayNameByUserId 改成一律用原始值（見
// resolveLineUserDisplayNames 上方說明），這裡的斷言跟著更新——不是
// 刪掉了事，是原本「可接受的邊界代價」現在真的變成「沒有代價」了。
test('resolveLineUserDisplayNames escapes a formula-trigger-prefixed userId before queuing it as a new row, but keeps the display-facing value unescaped', () => {
  const result = resolveLineUserDisplayNames([], ['=HYPERLINK("http://evil.example")']);

  expect(result.newRows).toEqual([
    { userId: "'=HYPERLINK(\"http://evil.example\")", displayId: "'=HYPERLINK(\"http://evil.example\")" }
  ]);
  expect(result.displayNameByUserId['=HYPERLINK("http://evil.example")']).toBe(
    '=HYPERLINK("http://evil.example")'
  );
});

test('resolveLineUserDisplayNames does not touch already-registered userIds even if their stored form looks like it could need escaping', () => {
  // 已登記過的列（displayIdByUserId 命中）完全不經過這次要修的那個分支——
  // 這些值本來就是從 Sheets 讀回來的既有資料，跳脫責任在當初寫入那一刻，
  // 不是這支函式的職責。
  const rows = [{ userId: '=already', displayId: '=already' }];

  const result = resolveLineUserDisplayNames(rows, ['=already']);

  expect(result).toEqual({
    displayNameByUserId: { '=already': '=already' },
    newRows: []
  });
});
