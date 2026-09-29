const { buildLineStagingRow } = require('../src/lineStaging');

test('buildLineStagingRow 對一般內容也套用新版的一律加前綴規則（mycr 第 15 輪票 05：每個欄位各自獨立佔一格，Sheets 讀取時會自動去除前綴，不影響 hasProcessedEvent 等值比對）', () => {
  const row = buildLineStagingRow('group1', '2026/09/12 10:00:00', 'Uabc123', 'text', 'hello there', 'event-1', false);
  expect(row).toEqual(['group1', "'2026/09/12 10:00:00", "'Uabc123", 'text', "'hello there", "'event-1", false]);
});

test('buildLineStagingRow 對開頭是公式觸發字元的 content 做跳脫', () => {
  const row = buildLineStagingRow('group1', '2026/09/12 10:00:00', 'Uabc123', 'text', '=SUM(A1:A9)', 'event-2', false);
  expect(row[4]).toBe("'=SUM(A1:A9)");
});

test('buildLineStagingRow 對開頭是公式觸發字元的 displayName 做跳脫', () => {
  const row = buildLineStagingRow('group1', '2026/09/12 10:00:00', '=EVIL()', 'text', 'hi', 'event-3', false);
  expect(row[2]).toBe("'=EVIL()");
});

test('buildLineStagingRow 對 webhookEventId 也套用新版前綴，recalled 旗標不受跳脫影響（實際存回 Sheets 後讀回來會自動去除前綴，見 hasProcessedEvent.test.js 的完整讀寫迴圈驗證）', () => {
  const row = buildLineStagingRow('group1', '2026/09/12 10:00:00', 'Uabc123', 'text', 'hi', 'event-4', true);
  expect(row[5]).toBe("'event-4");
  expect(row[6]).toBe(true);
});

// `/mycr` 全新視角複掃 Finding 3 的迴歸測試：webhookEventId（= event.message.id）
// 在 M3（webhook 沒有簽章驗證）前提被突破時，理論上可以是攻擊者自訂的任意
// 字串，不像 groupId 必須精確符合白名單。跟 content/displayName 一樣，開頭
// 是公式觸發字元時要被跳脫。
test('buildLineStagingRow 對開頭是公式觸發字元的 webhookEventId 也做跳脫', () => {
  const row = buildLineStagingRow('group1', '2026/09/12 10:00:00', 'Uabc123', 'text', 'hi', '=HYPERLINK("http://evil.example")', false);
  expect(row[5]).toBe('\'=HYPERLINK("http://evil.example")');
});

test('buildLineStagingRow 對 +/-/@ 開頭的 content 也一併跳脫，跟專案既有的公式注入規則一致', () => {
  expect(buildLineStagingRow('g', 't', 'd', 'text', '+1', 'e', false)[4]).toBe("'+1");
  expect(buildLineStagingRow('g', 't', 'd', 'text', '-1', 'e', false)[4]).toBe("'-1");
  expect(buildLineStagingRow('g', 't', 'd', 'text', '@here', 'e', false)[4]).toBe("'@here");
});
