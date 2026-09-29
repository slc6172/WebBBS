const { createFakeCache } = require('./doubles/fakeCache');
const {
  checkAndConsumeRegistrationQuota_,
  REGISTER_LIMIT_PER_5MIN,
  REGISTER_LIMIT_PER_HOUR
} = require('../src/register');

// 提高註冊成本（見對話紀錄）：GAS 平台完全拿不到來源 IP，任何全站共用的
// 計數器都沒辦法真正區分惡意/正常來源，這裡刻意選擇「提高成本」而不是
// 「精準攔截」的定位——兩個上限都是常數，之後依實際使用狀況調整。
// 這支測試只驗證計數邏輯本身；真實的視窗到期行為（cache 過期）是 GAS
// 執行環境的行為，fakeCache 沒有模擬 TTL，比照 login.js 既有的鎖定機制
// 測試慣例，用 MANUAL_VERIFICATION.md 手動驗收。

test('REGISTER_LIMIT_PER_5MIN/PER_HOUR default to the agreed starting values (1 and 10)', () => {
  expect(REGISTER_LIMIT_PER_5MIN).toBe(1);
  expect(REGISTER_LIMIT_PER_HOUR).toBe(10);
});

test('allows the first registration attempt', () => {
  const cache = createFakeCache();
  expect(checkAndConsumeRegistrationQuota_(cache)).toEqual({ allowed: true });
});

test('rejects a second attempt within the same 5-minute window even though the hourly cap has plenty of room', () => {
  const cache = createFakeCache();
  expect(checkAndConsumeRegistrationQuota_(cache)).toEqual({ allowed: true });
  expect(checkAndConsumeRegistrationQuota_(cache)).toEqual({ allowed: false });
});

test('rejects once the hourly cap is reached, even if each individual attempt were spread out enough to clear the 5-minute cap', () => {
  const cache = createFakeCache();
  // fakeCache 沒有 TTL，用手動改值模擬「5 分鐘視窗已經重置、但小時計數器還在累積」
  // 這個情境，逐一驗證小時上限本身有獨立生效，不是只看 5 分鐘那一層。
  for (let i = 0; i < REGISTER_LIMIT_PER_HOUR; i++) {
    cache.put('registerCount5Min', '0'); // 模擬每次都已經跨過 5 分鐘視窗
    expect(checkAndConsumeRegistrationQuota_(cache)).toEqual({ allowed: true });
  }
  cache.put('registerCount5Min', '0');
  expect(checkAndConsumeRegistrationQuota_(cache)).toEqual({ allowed: false });
});

test('does not throw and treats a missing/corrupted cache value as zero', () => {
  const cache = createFakeCache();
  cache.put('registerCount5Min', 'not-a-number');
  cache.put('registerCount1Hour', 'not-a-number');
  expect(() => checkAndConsumeRegistrationQuota_(cache)).not.toThrow();
});
