const { validateUserId } = require('../src/register');

test('validateUserId accepts an id made of letters, numbers, and underscores within 4-20 chars', () => {
  expect(validateUserId('user_01')).toEqual({ valid: true });
});

test('validateUserId rejects an id shorter than 4 characters', () => {
  expect(validateUserId('abc')).toEqual({ valid: false, error: 'userId 長度需為 4~20 字元' });
});

test('validateUserId rejects an id longer than 20 characters', () => {
  expect(validateUserId('a'.repeat(21))).toEqual({ valid: false, error: 'userId 長度需為 4~20 字元' });
});

test('validateUserId rejects an id containing characters other than letters, numbers, and underscores', () => {
  expect(validateUserId('user-01')).toEqual({ valid: false, error: 'userId 只能包含英數字與底線' });
});

// mycr 第 15 輪票 02：保留名稱檢查（大小寫不敏感）——見 mycr 掃描報告
// F-04，LINE 彙整文章固定以字串 'SYSTEM' 當作者，一般使用者若搶先註冊
// 這個（或大小寫變化的）帳號名稱，就能編輯/刪除全部彙整文章。
test.each(['system', 'System', 'SYSTEM', 'SyStEm'])(
  'validateUserId rejects the reserved name in any case variation: %s',
  (reserved) => {
    expect(validateUserId(reserved)).toEqual({ valid: false, error: '此帳號名稱已保留，請改用其他名稱' });
  }
);

// mycr 第 15 輪票 02：純數字 userId 檢查——見 mycr 掃描報告 F-15，純數字
// 字串寫進 Users 表時會被 Google Sheets 自動轉成 Number，讀回來的型別
// 跟註冊/登入時比對用的字串不一致，會讓唯一性檢查與登入失效。與其在
// 儲存層想辦法保護（會牽動全部讀取 userId 做 === 比對的呼叫端），在
// 註冊當下直接拒絕純數字 userId 成本最低、風險最小。
test.each(['1234', '12345', '000000'])(
  'validateUserId rejects a purely numeric id: %s',
  (numericId) => {
    expect(validateUserId(numericId)).toEqual({ valid: false, error: 'userId 不能全部是數字' });
  }
);

test('validateUserId still accepts an id that merely contains digits alongside letters', () => {
  expect(validateUserId('user1234')).toEqual({ valid: true });
});
