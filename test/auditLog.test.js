const { AUDIT_ACTIONS, buildAuditLogRow_, appendAuditLogEntry_ } = require('../src/auditLog');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

test('buildAuditLogRow_ force-escapes the timestamp to plain text and fills in blanks for missing optional fields', () => {
  const row = buildAuditLogRow_('2026/09/16 10:00:00', 'admin01', AUDIT_ACTIONS.ADMIN_RESET_PASSWORD, 'alice01', 'detail');
  // mycr 第 15 輪票 05：actor/target/detail 各自獨立佔一格（不像
  // articleTitle/imageUrls 是巢狀在 JSON 裡），escapeFormulaInjection
  // 改成一律加前綴後，這三欄現在都會被加上前綴，反映在斷言裡——不是
  // 刪掉了事，是老實更新成新行為。
  expect(row).toEqual(["'2026/09/16 10:00:00", "'admin01", 'ADMIN_RESET_PASSWORD', "'alice01", "'detail"]);
});

test('buildAuditLogRow_ defaults missing actor/action/target/detail to empty strings rather than throwing', () => {
  const row = buildAuditLogRow_('2026/09/16 10:00:00');
  expect(row).toEqual(["'2026/09/16 10:00:00", '', '', '', '']);
});

// `/mycr` 全新視角複掃 Finding 2 的迴歸測試：LOGIN_LOCKOUT 這個事件的
// actor/target 直接是登入表單的原始 userId 輸入，完全沒有格式驗證——任何
// 人都能用一個刻意構造的字串連續打錯密碼 5 次觸發。跟 lineStaging.js／
// lineUserId.js 同一個理由，補上 escapeFormulaInjection。
test('buildAuditLogRow_ escapes an actor/target that starts with a formula-trigger character (LOGIN_LOCKOUT uses the raw, unvalidated login-attempt userId)', () => {
  const row = buildAuditLogRow_(
    '2026/09/16 10:00:00',
    '=HYPERLINK("http://evil.example")',
    AUDIT_ACTIONS.LOGIN_LOCKOUT,
    '=HYPERLINK("http://evil.example")',
    ''
  );
  expect(row[1]).toBe('\'=HYPERLINK("http://evil.example")');
  expect(row[3]).toBe('\'=HYPERLINK("http://evil.example")');
});

test('buildAuditLogRow_ escapes a detail field that starts with a formula-trigger character', () => {
  const row = buildAuditLogRow_('2026/09/16 10:00:00', 'admin01', AUDIT_ACTIONS.ADMIN_EDIT_OTHERS_CONTENT, 'a1', '+1');
  expect(row[4]).toBe("'+1");
});

test('buildAuditLogRow_ never escapes the action field itself — it is always one of the fixed AUDIT_ACTIONS strings', () => {
  const row = buildAuditLogRow_('2026/09/16 10:00:00', 'admin01', AUDIT_ACTIONS.LOGIN_LOCKOUT, 'alice01', '');
  expect(row[2]).toBe('LOGIN_LOCKOUT');
});

test('appendAuditLogEntry_ appends exactly one row to an existing AuditLog sheet', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  appendAuditLogEntry_(ss, '2026/09/16 10:00:00', 'admin01', AUDIT_ACTIONS.LOGIN_LOCKOUT, 'alice01', '');

  const sheet = ss.getSheetByName('AuditLog');
  expect(sheet.getLastRow()).toBe(2);
  expect(sheet.getRange(2, 1, 1, 5).getValues()[0][2]).toBe('LOGIN_LOCKOUT');
});

test('appendAuditLogEntry_ never throws even when the AuditLog sheet does not exist (fails silently, never breaks the caller)', () => {
  const ss = createFakeSpreadsheet(); // ensureSchema 沒被呼叫過，AuditLog 分頁不存在
  expect(() => {
    appendAuditLogEntry_(ss, '2026/09/16 10:00:00', 'admin01', AUDIT_ACTIONS.LOGIN_LOCKOUT, 'alice01', '');
  }).not.toThrow();
});
