const { escapeFormulaInjection } = require('../src/postArticle');

// 這個檔案只測 postArticle.js 的 re-export 路徑本身還能正常運作（確保
// 既有呼叫端沒有斷掉），正本的完整行為（含 mycr 第 15 輪票 05 的統一
// 前綴防護）在 test/formulaInjection.test.js 測，兩者刻意保持同步。

test('escapeFormulaInjection prefixes a leading equals sign with a single quote', () => {
  expect(escapeFormulaInjection('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
});

test('escapeFormulaInjection now prefixes ordinary text too (invisible on read — GAS strips a leading literal-text apostrophe)', () => {
  expect(escapeFormulaInjection('今天天氣真好')).toBe("'今天天氣真好");
});

test('escapeFormulaInjection leaves empty string untouched', () => {
  expect(escapeFormulaInjection('')).toBe('');
});
