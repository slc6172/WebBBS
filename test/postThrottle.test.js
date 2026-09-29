const { createFakeCache } = require('./doubles/fakeCache');
const {
  checkAndConsumePostQuota_,
  POST_LIMIT_PER_WINDOW
} = require('../src/postThrottle');

// 跟 checkAndConsumeRegistrationQuota_ 不同：發文/回覆是已登入的，綁在
// 每個 userId 自己身上，一個人洗版只會擋到自己，不會變成新的共用攻擊面
// ——見 postThrottle.js 開頭的完整理由。這支測試只驗證計數邏輯本身；
// 真實的視窗到期行為（cache 過期）是 GAS 執行環境的行為，fakeCache 沒
// 有模擬 TTL，比照既有慣例用 MANUAL_VERIFICATION.md 手動驗收。

test('POST_LIMIT_PER_WINDOW defaults to the agreed starting value (10)', () => {
  expect(POST_LIMIT_PER_WINDOW).toBe(10);
});

test('allows the first post/reply attempt for a user', () => {
  const cache = createFakeCache();
  expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: true });
});

test('rejects once a single user hits the limit within the window', () => {
  const cache = createFakeCache();
  for (let i = 0; i < POST_LIMIT_PER_WINDOW; i++) {
    expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: true });
  }
  expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: false });
});

test('one user hitting their limit does not affect a different user — per-user, not site-wide', () => {
  const cache = createFakeCache();
  for (let i = 0; i < POST_LIMIT_PER_WINDOW; i++) {
    checkAndConsumePostQuota_(cache, 'alice01');
  }
  expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: false });
  expect(checkAndConsumePostQuota_(cache, 'bob0002')).toEqual({ allowed: true });
});

test('articles and replies share the same counter for a given user (posting an article counts toward the reply limit and vice versa)', () => {
  const cache = createFakeCache();
  for (let i = 0; i < POST_LIMIT_PER_WINDOW; i++) {
    // 呼叫端不區分是發文還是回覆，都是同一支函式、同一個 key
    checkAndConsumePostQuota_(cache, 'alice01');
  }
  expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: false });
});

test('does not throw and treats a missing/corrupted cache value as zero', () => {
  const cache = createFakeCache();
  cache.put('postThrottle_alice01', 'not-a-number');
  expect(() => checkAndConsumePostQuota_(cache, 'alice01')).not.toThrow();
  expect(checkAndConsumePostQuota_(cache, 'alice01')).toEqual({ allowed: true });
});
