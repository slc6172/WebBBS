const fs = require('fs');
const path = require('path');

// mycr 重掃 C-1：GAS 把所有檔案併進同一個全域命名空間，同名函式後載入的會覆蓋先載入的。
// 這個專案為了讓每個檔案能被 Node 單獨測試，刻意在多個檔案各放一份同名的小型轉接函式
// （例如 parseImageUrlsCell_、getRolePermissionsFor_）。這是已知且有意的做法，
// 真正的風險是「其中一份被單獨修改，兩份行為不同」——此時誰生效取決於檔案載入順序，
// 而 Node 測試（每個檔案只載入自己那份）完全看不出來。
// 這個測試要求：同名的頂層函式，把「Node 專用的模組控制代碼」（_xxxModule、_register 這類
// 以底線開頭的識別字）換成同一個佔位符、去掉註解與空白之後，內容必須一模一樣。
// （在 GAS 環境那些控制代碼都是 null，所以走的是同一條全域函式路徑。）

const SRC = path.join(__dirname, '..', 'src');

function normalize(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\b_[A-Za-z0-9]+\b/g, '_M')
    .replace(/\s+/g, '');
}

function collect() {
  const byName = {};
  fs.readdirSync(SRC).filter(function (f) { return f.endsWith('.js'); }).sort().forEach(function (file) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    const re = /^function ([A-Za-z0-9_]+)\(/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      const end = text.indexOf('\n}\n', m.index);
      (byName[m[1]] = byName[m[1]] || []).push({
        file: file,
        body: normalize(text.slice(m.index, end === -1 ? text.length : end + 2))
      });
    }
  });
  return byName;
}

test('every function name defined in more than one file has the same behaviour in all copies', () => {
  const byName = collect();
  const diverged = [];
  Object.keys(byName).forEach(function (name) {
    const copies = byName[name];
    if (copies.length > 1) {
      const distinct = new Set(copies.map(function (c) { return c.body; }));
      if (distinct.size > 1) {
        diverged.push(name + ' (' + copies.map(function (c) { return c.file; }).join(', ') + ')');
      }
    }
  });
  expect(diverged).toEqual([]);
});

test('the check itself works: it does notice a copy whose real logic differs, but ignores a different module handle name', () => {
  expect(normalize('function a_(x){return (_fooModule ? _fooModule.f : f)(x);}'))
    .toBe(normalize('function a_(x){return (_barModule ? _barModule.f : f)(x);}'));
  expect(normalize('function a_(x){return (_fooModule ? _fooModule.f : f)(x);}'))
    .not.toBe(normalize('function a_(x){return (_fooModule ? _fooModule.f : g)(x);}'));
});
