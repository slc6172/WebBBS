const { escapeFormulaInjection } = require('../src/formulaInjection');

// `/mycr` 全新視角複掃：escapeFormulaInjection 的正本現在住在這個零依賴的
// 葉節點模組（見 src/formulaInjection.js 開頭註解的循環 require 成因）。
// test/escapeFormulaInjection.test.js 繼續測 postArticle.js 的 re-export
// 這條路徑（確保既有呼叫端沒有斷掉），這裡直接測正本，兩者都要維持綠燈。

test('escapeFormulaInjection prefixes a leading equals sign with a single quote', () => {
  expect(escapeFormulaInjection('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
});

test('escapeFormulaInjection prefixes a leading plus, minus, or at sign the same way', () => {
  expect(escapeFormulaInjection('+1+1')).toBe("'+1+1");
  expect(escapeFormulaInjection('-1')).toBe("'-1");
  expect(escapeFormulaInjection('@mention')).toBe("'@mention");
});

// mycr 第 15 輪票 05（見 F-15）：改成對任何非空字串一律加前綴，不再只
// 挑開頭是特定符號的字串——真實試算表實測（見對話紀錄）證實看起來像
// 數字、日期、時間、布林值的一般文字，寫入試算表後會被自動轉換型別，
// 不是只有公式注入這一種風險。統一用同一招防護，不用一一列舉「哪些
// 字串看起來會被轉換」（日期/百分比/貨幣格式太多，列不完）。讀取端完全
// 不用改：GAS 讀取時本來就會自動去掉這個前綴（fakeSpreadsheet.js 也是
// 這樣模擬的），所以這裡斷言的是「加了前綴」這件事本身，不是「使用者
// 會看到前綴」。
test('escapeFormulaInjection now prefixes ordinary text too (invisible on read — GAS strips a leading literal-text apostrophe)', () => {
  expect(escapeFormulaInjection('今天天氣真好')).toBe("'今天天氣真好");
});

test.each([
  '12345',                    // 會被轉成 Number
  '1/2',                      // 會被轉成 Date
  '5:30',                     // 會被轉成 Date（時間序列值）
  'TRUE',                     // 會被轉成 Boolean
  '2026/09/21 10:00:00'       // 會被轉成 Date
])('escapeFormulaInjection prefixes values that look like they would be auto-coerced: %s', (value) => {
  expect(escapeFormulaInjection(value)).toBe("'" + value);
});

test('escapeFormulaInjection leaves empty string untouched', () => {
  expect(escapeFormulaInjection('')).toBe('');
});

test('escapeFormulaInjection leaves non-string values untouched (numbers, null, undefined)', () => {
  expect(escapeFormulaInjection(12345)).toBe(12345);
  expect(escapeFormulaInjection(null)).toBe(null);
  expect(escapeFormulaInjection(undefined)).toBe(undefined);
});
