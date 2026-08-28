const { isWebhookForThisBot } = require('../src/verifyWebhookDestination');

// 安全性審查 M3 回歸測試：見 gas-bbs-perf-round-review.md M3。

test('isWebhookForThisBot returns true when destination matches the configured bot user ID', () => {
  const body = { destination: 'U8189cf6745fc0d808977bdb0b9f22995', events: [] };

  expect(isWebhookForThisBot(body, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(true);
});

test('isWebhookForThisBot returns false when destination does not match', () => {
  const body = { destination: 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', events: [] };

  expect(isWebhookForThisBot(body, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(false);
});

test('isWebhookForThisBot returns false when destination is missing from the body entirely', () => {
  const body = { events: [] };

  expect(isWebhookForThisBot(body, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(false);
});

test('isWebhookForThisBot returns false for a null/undefined body', () => {
  expect(isWebhookForThisBot(null, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(false);
  expect(isWebhookForThisBot(undefined, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(false);
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
  const body = { destination: 'U8189cf6745fc0d808977bdb0b9f22995extra' };

  expect(isWebhookForThisBot(body, 'U8189cf6745fc0d808977bdb0b9f22995')).toBe(false);
});
