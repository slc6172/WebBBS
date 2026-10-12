const { isWebhookForThisBot } = require('../src/verifyWebhookDestination');

// 安全性審查 M3 回歸測試：見 gas-bbs-perf-round-review.md M3。

test('isWebhookForThisBot returns true when destination matches the configured bot user ID', () => {
  const body = { destination: 'U0123456789abcdef0123456789abcdef', events: [] };

  expect(isWebhookForThisBot(body, 'U0123456789abcdef0123456789abcdef')).toBe(true);
});

test('isWebhookForThisBot returns false when destination does not match', () => {
  const body = { destination: 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', events: [] };

  expect(isWebhookForThisBot(body, 'U0123456789abcdef0123456789abcdef')).toBe(false);
});

test('isWebhookForThisBot returns false when destination is missing from the body entirely', () => {
  const body = { events: [] };

  expect(isWebhookForThisBot(body, 'U0123456789abcdef0123456789abcdef')).toBe(false);
});

test('isWebhookForThisBot returns false for a null/undefined body', () => {
  expect(isWebhookForThisBot(null, 'U0123456789abcdef0123456789abcdef')).toBe(false);
  expect(isWebhookForThisBot(undefined, 'U0123456789abcdef0123456789abcdef')).toBe(false);
});

// 忘記設定 LINE_BOT_USER_ID 這個 Script Property 時（例如修復上線前的
// 舊環境），維持「不檢查」的舊行為，不要讓整個 LINE 功能因為忘記設定
// 就悄悄失效。
test('isWebhookForThisBot returns true (no-op) when expectedBotUserId is not configured', () => {
  const body = { destination: 'anything', events: [] };

  expect(isWebhookForThisBot(body, undefined)).toBe(true);
  expect(isWebhookForThisBot(body, '')).toBe(true);
  expect(isWebhookForThisBot(body, null)).toBe(true);
});

test('isWebhookForThisBot performs an exact string match, not a prefix/substring match', () => {
  const body = { destination: 'U0123456789abcdef0123456789abcdefextra' };

  expect(isWebhookForThisBot(body, 'U0123456789abcdef0123456789abcdef')).toBe(false);
});

// mycr 重掃 F-12：doPost 對異常輸入的穩健性與記錄檔清理
const { parseWebhookBody, sanitizeForLog } = require('../src/verifyWebhookDestination');

describe('parseWebhookBody', () => {
  test('returns the parsed object for a normal JSON object body', () => {
    expect(parseWebhookBody('{"destination":"Uxxx","events":[]}')).toEqual({ destination: 'Uxxx', events: [] });
  });

  test('returns null (never throws) for malformed JSON, empty input, and non-object JSON', () => {
    expect(parseWebhookBody('{not json')).toBeNull();
    expect(parseWebhookBody('')).toBeNull();
    expect(parseWebhookBody(undefined)).toBeNull();
    expect(parseWebhookBody(null)).toBeNull();
    expect(parseWebhookBody('null')).toBeNull();
    expect(parseWebhookBody('123')).toBeNull();
    expect(parseWebhookBody('"text"')).toBeNull();
    expect(parseWebhookBody('[1,2]')).toBeNull();
  });
});

describe('sanitizeForLog', () => {
  test('strips control characters and newlines so one log line cannot be forged as several', () => {
    expect(sanitizeForLog('abc\nFAKE LOG LINE\r\tend')).toBe('abc FAKE LOG LINE  end');
  });

  test('caps the length and handles non-strings', () => {
    expect(sanitizeForLog('x'.repeat(500)).length).toBeLessThanOrEqual(81);
    expect(sanitizeForLog(undefined)).toBe('');
    expect(sanitizeForLog({ a: 1 })).toBe('');
    expect(sanitizeForLog(12)).toBe('12');
  });
});
