const { login_: login } = require('../src/login');
const { registerUser_: registerUser } = require('../src/register');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeCache } = require('./doubles/fakeCache');

// mycr 重掃 F-03：登入失敗計數原本是「讀 → 驗證密碼 → 寫」，並行請求會在任何人
// 寫回之前就全部讀到同一個計數、全部通過檢查並各自驗證密碼。修法：在驗證密碼
// 「之前」，於短鎖內先讀取並預留這次嘗試（計數 +1），驗證完成後鎖早已釋放。
// 真正的並行無法在 Node 單執行緒重現，所以用「驗證密碼的瞬間，另一個請求插進來」
// 這種可決定性的交錯來模擬。

function fakeDigest(input) {
  return Array.from(input).map(function (ch) { return ch.charCodeAt(0); });
}

function seed() {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  registerUser(ss, createFakeLock(), fakeDigest, {
    userId: 'alice01', password: 'correct-horse-battery-staple', salt: 'fixed-salt', createdAt: '2026/07/30 12:00:00'
  });
  return ss;
}

function trackingLock(options) {
  const lock = { held: false, waits: 0, releases: 0, waitArgs: [] };
  lock.waitLock = function (ms) {
    lock.waits += 1;
    lock.waitArgs.push(ms);
    if (options && options.failToAcquire) { throw new Error('Lock timeout'); }
    lock.held = true;
  };
  lock.releaseLock = function () { lock.releases += 1; lock.held = false; };
  return lock;
}

const NOW = '2026/08/05 09:00:00';
const tokenGen = function () { return 'tok'; };

test('the attempt is reserved BEFORE the password is verified, not after', () => {
  const ss = seed();
  const cache = createFakeCache();
  let seenDuringVerify = null;
  const spyDigest = function (s) {
    if (seenDuringVerify === null) { seenDuringVerify = cache.get('loginFail_alice01'); }
    return fakeDigest(s);
  };
  login(ss, cache, tokenGen, spyDigest, NOW, { userId: 'alice01', password: 'wrong-password-1' });
  expect(seenDuringVerify).toBe('1');
});

test('in-flight concurrent attempts are bounded by the threshold: the 6th never reaches password verification', () => {
  const ss = seed();
  const cache = createFakeCache();
  let verifications = 0;
  let depth = 0;
  let digest;
  digest = function (s) {
    verifications += 1;
    if (depth < 12) {
      depth += 1;
      // 這個請求正在驗證密碼的瞬間，下一個並行請求進來
      login(ss, cache, tokenGen, digest, NOW, { userId: 'alice01', password: 'guess-' + depth });
    }
    return fakeDigest(s);
  };
  login(ss, cache, tokenGen, digest, NOW, { userId: 'alice01', password: 'guess-0' });
  expect(verifications).toBe(5);
});

test('the lock is taken for the reservation only and is NOT held while the password is hashed', () => {
  const ss = seed();
  const cache = createFakeCache();
  const lock = trackingLock();
  let heldDuringVerify = null;
  const spyDigest = function (s) {
    if (heldDuringVerify === null) { heldDuringVerify = lock.held; }
    return fakeDigest(s);
  };
  login(ss, cache, tokenGen, spyDigest, NOW, { userId: 'alice01', password: 'wrong-password-1' }, lock);
  expect(heldDuringVerify).toBe(false);
  expect(lock.waits).toBe(1);
  expect(lock.releases).toBe(1);
  expect(lock.waitArgs[0]).toBeGreaterThan(0);
});

test('the lock is released on every exit path (success, wrong password, locked out, malformed userId)', () => {
  const ss = seed();
  const cache = createFakeCache();
  const lock = trackingLock();
  login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'nope-nope-1' }, lock);
  expect(lock.held).toBe(false);
  login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'correct-horse-battery-staple' }, lock);
  expect(lock.held).toBe(false);
  for (let i = 0; i < 6; i++) {
    login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'nope-nope-' + i }, lock);
    expect(lock.held).toBe(false);
  }
  login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'x', password: 'whatever-1' }, lock);
  expect(lock.held).toBe(false);
  expect(lock.waits).toBe(lock.releases);
});

test('if the lock cannot be acquired, login still works and the counter still counts (never worse than before)', () => {
  const ss = seed();
  const cache = createFakeCache();
  const lock = trackingLock({ failToAcquire: true });
  const wrong = login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'wrong-password-1' }, lock);
  expect(wrong).toEqual({ success: false, error: 'userId 或密碼錯誤' });
  expect(cache.get('loginFail_alice01')).toBe('1');
  const ok = login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'correct-horse-battery-staple' }, lock);
  expect(ok.success).toBe(true);
  expect(lock.releases).toBe(0);
});

test('without a lock argument (all existing callers) behaviour is unchanged', () => {
  const ss = seed();
  const cache = createFakeCache();
  for (let i = 0; i < 5; i++) {
    login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'wrong-' + i + '-pw' });
  }
  const locked = login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'correct-horse-battery-staple' });
  expect(locked).toEqual({ success: false, error: '帳號已被暫時鎖定,請稍後再試' });
});

test('a successful login clears the counter, including the attempt that was just reserved', () => {
  const ss = seed();
  const cache = createFakeCache();
  login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'wrong-password-1' });
  login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'wrong-password-2' });
  const ok = login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'correct-horse-battery-staple' });
  expect(ok.success).toBe(true);
  expect(cache.get('loginFail_alice01')).toBeNull();
});

test('a role-blocked login (correct password, login permission false) gives the attempt back, so it still does not count toward the lockout', () => {
  const ss = seed();
  ss.getSheetByName('Users').getRange(2, 4, 1, 1).setValues([['blocked-role']]);
  ss.getSheetByName('Permission').appendRow(['blocked-role', false, false, false, false, false, false, false, false]);
  const cache = createFakeCache();
  for (let i = 0; i < 8; i++) {
    const r = login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'correct-horse-battery-staple' });
    expect(r).toEqual({ success: false, error: 'userId 或密碼錯誤' });
  }
  expect(cache.get('loginFail_alice01')).toBeNull();
});

test('the lockout audit entry is still written exactly once, at the attempt that reaches the threshold', () => {
  const ss = seed();
  const cache = createFakeCache();
  for (let i = 0; i < 9; i++) {
    login(ss, cache, tokenGen, fakeDigest, NOW, { userId: 'alice01', password: 'wrong-' + i + '-pw' });
  }
  const audit = ss.getSheetByName('AuditLog');
  expect(audit.getLastRow() - 1).toBe(1);
});
