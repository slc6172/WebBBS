const { escapeFormulaInjection } = require('../src/postArticle');

test('escapeFormulaInjection prefixes a leading equals sign with a single quote', () => {
  expect(escapeFormulaInjection('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
});

test('escapeFormulaInjection prefixes a leading plus, minus, or at sign the same way', () => {
  expect(escapeFormulaInjection('+1+1')).toBe("'+1+1");
  expect(escapeFormulaInjection('-1')).toBe("'-1");
  expect(escapeFormulaInjection('@mention')).toBe("'@mention");
});

test('escapeFormulaInjection leaves normal text untouched', () => {
  expect(escapeFormulaInjection('今天天氣真好')).toBe('今天天氣真好');
});

test('escapeFormulaInjection leaves empty string untouched', () => {
  expect(escapeFormulaInjection('')).toBe('');
});
