const { validatePassword } = require('../src/register');

// mycr 第 15 輪票 02：最短長度從 6 碼提高到 8 碼——這裡直接改掉舊斷言
// 反映新行為（不是刪掉了事，見 README「/tdd 紅綠燈流程」既有原則）。
test('validatePassword accepts a password with 8 or more characters that is not on the blacklist', () => {
  expect(validatePassword('abc12345')).toEqual({ valid: true });
});

test('validatePassword rejects a password shorter than 8 characters', () => {
  expect(validatePassword('abc1234')).toEqual({ valid: false, error: '密碼長度至少需要8碼' });
});

// mycr 第 15 輪票 02：常見弱密碼黑名單，只在長度已經合格（≥8 碼）時才
// 檢查——比對前先轉小寫，跟大小寫變化（Password1 之類）視為同一個弱
// 密碼。清單本身不是密碼政策的完整解，只是擋掉最容易被字典攻擊命中的
// 一批。
test.each([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein1', 'admin1234', 'iloveyou1', '11111111',
  'abc123456', 'welcome1', 'monkey123', 'dragon123', 'football1',
  'baseball1', 'trustno1a', 'sunshine1', 'princess1', 'superman1'
])('validatePassword rejects the common weak password: %s', (weak) => {
  expect(validatePassword(weak)).toEqual({ valid: false, error: '此密碼過於常見，請換一個更安全的密碼' });
});

test('validatePassword blacklist check is case-insensitive', () => {
  expect(validatePassword('Password1')).toEqual({ valid: false, error: '此密碼過於常見，請換一個更安全的密碼' });
});
