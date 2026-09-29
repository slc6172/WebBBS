// GAS 的 doGet/doPost 進入點（Code.js、lineBotGlue.js）跟 src/*.js 不同，
// 不走這個專案既有的依賴注入慣例（xxxFor_(deps, ...)），而是直接呼叫
// SpreadsheetApp/CacheService/LockService/PropertiesService/Utilities/
// DriveApp/HtmlService 這些 GAS 全域服務——這正是 Code.js/lineBotGlue.js
// 依專案慣例「沒有自動化測試，只能靠 MANUAL_VERIFICATION.md 人工驗收」的
// 根本原因：既有的 test/doubles/fake*.js 全部是設計成「當一個參數被注入」，
// 沒有東西可以讓 Code.js 的全域呼叫落地。
//
// 這支模組把「真正的 src/*.js 全部檔案 + Code.js」載入同一個 Node vm
// context（模擬 GAS 把所有檔案攤平成單一全域命名空間這件事本身），並把
// 上面那些 GAS 服務用既有的 fake* 測試替身接起來，讓 Code.js 的 RPC
// 進入點也能在 Node 環境下被測試——不取代 MANUAL_VERIFICATION.md（真實
// GAS 執行期的樣板編譯、實際延遲、真正的 Drive/Sheets 行為仍然只能在
// 部署後人工驗收），而是補上「邏輯本身對不對」這一層，讓 Code.js 的
// RPC 也能享有跟 src/*.js 一樣的紅燈／綠燈開發流程。
//
// 用法：
//   const { createGasGlobalContext } = require('./doubles/gasGlobalContext');
//   const g = createGasGlobalContext();
//   g.ss.getSheetByName('Users').appendRow([...]);
//   const result = g.ctx.postArticleFromForm(token, boardId, title, content, []);

var vm = require('vm');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var { createFakeSpreadsheet } = require('./fakeSpreadsheet');
var { createFakeCache } = require('./fakeCache');
var { createFakeLock } = require('./fakeLock');
var { createFakeProperties } = require('./fakeProperties');
var { createFakeDrive } = require('./fakeDrive');

var SRC_DIR = path.join(__dirname, '..', '..', 'src');

/**
 * 傳回目前 src/*.js 的檔名清單（不含 Code.js），依檔名字母序——這個順序
 * 本身就是 mycr 第 15 輪票 06 要修正、要用測試鎖住的東西（同名函式不該
 * 因為順序不同而有不同行為），所以這裡刻意跟 `fs.readdirSync` 的預設
 * 排序一致、不額外調整，讓這支骨架本身也能拿來當「換一種順序跑一次
 * 同一組測試」的手段。
 * @returns {string[]}
 */
function listSrcFiles() {
  return fs.readdirSync(SRC_DIR).filter(function (f) { return f.endsWith('.js'); }).sort();
}

/**
 * 建立一個共用的 Node vm context，把 GAS 服務用既有的 fake* 測試替身
 * (或呼叫端自備的替身) 接起來，並依指定順序把 src/*.js + Code.js 的原始
 * 檔案內容當成純文字腳本載入同一個全域命名空間——完全不使用 Node 的
 * module/require，跟真實 GAS 把每個 .gs/.js 檔攤平成同一個全域命名空間
 * 的行為一致。
 *
 * @param {Object} [options]
 * @param {string[]} [options.order] - src/*.js 的載入順序（不含 Code.js，
 *   Code.js 一律最後載入，因為它是進入點，依賴其他檔案先定義好函式）。
 *   預設用 listSrcFiles() 的字母序。傳入不同順序可以驗證「行為不應該
 *   因載入順序而改變」這件事本身。
 * @param {Object} [options.drive] - 若不提供則用 fakeDrive 建立一份
 * @returns {{ctx: Object, ss: Object, cache: Object, lock: Object,
 *   properties: Object, drive: Object}}
 */
function createGasGlobalContext(options) {
  options = options || {};
  var ss = createFakeSpreadsheet();
  var cache = createFakeCache();
  var lock = createFakeLock();
  var properties = createFakeProperties();
  var drive = options.drive || createFakeDrive();

  var sandbox = {
    console: console,
    Object: Object, JSON: JSON, Math: Math, Array: Array, String: String,
    Number: Number, Date: Date, Boolean: Boolean, RegExp: RegExp,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, Error: Error,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,

    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return ss; },
      newDataValidation: function () {
        return {
          requireValueInList: function () { return this; },
          build: function () { return {}; }
        };
      }
    },
    CacheService: { getScriptCache: function () { return cache; } },
    LockService: { getScriptLock: function () { return lock; } },
    PropertiesService: { getScriptProperties: function () { return properties; } },
    DriveApp: {
      getFolderById: function (id) { return drive.getFolderById(id); },
      getFileById: function (id) {
        var f = drive._files[id];
        if (!f) { return null; }
        return {
          setSharing: function () {},
          setName: function () {},
          getBlob: function () { return { getBytes: function () { return []; }, getContentType: function () { return f.mimeType; } }; }
        };
      },
      createFolder: function (name) { return drive.createFolder(null, name); },
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    },
    HtmlService: {
      createTemplateFromFile: function () {
        return {
          evaluate: function () { return { setTitle: function () { return this; }, setXFrameOptionsMode: function () { return this; } }; }
        };
      },
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
    },
    Utilities: {
      getUuid: function () { return crypto.randomUUID(); },
      formatDate: function (date) {
        // 固定格式輸出，跟 schema.js 對這些欄位的描述（純文字時間戳字串）
        // 保持一致的「看起來像時間戳」形狀，測試不依賴實際數值。
        var d = (date instanceof Date) ? date : new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' +
          pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      },
      computeDigest: function (algorithm, str) {
        return Array.from(crypto.createHash('sha256').update(str).digest())
          .map(function (b) { return b > 127 ? b - 256 : b; });
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); },
      base64Decode: function (str) { return Array.from(Buffer.from(str, 'base64')); },
      newBlob: function (bytes, mimeType, name) { return { bytes: bytes, mimeType: mimeType, name: name }; }
    }
  };

  // 既有的 fakeSpreadsheet.js 是為 src/*.js 的測試設計的，那邊全部呼叫端
  // 都用 setValues（多欄/多列的陣列形式）。Code.js 這層 glue 邏輯有幾處
  // 用單一儲存格的 setValue（例如 bumpBoardActivity_ 更新單一時間戳
  // 欄位），既有假物件沒有這個方法——這不是要修的 bug，只是測試替身的
  // 涵蓋範圍原本沒有考慮到 Code.js 這層的呼叫慣例，這裡用一層薄薄的
  // 包裝補上等價行為（單一值包成 [[value]] 轉呼叫 setValues），不改
  // fakeSpreadsheet.js 本身，其他既有測試不受影響。
  //
  // 包裝要掛在 getSheetByName / insertSheet 這兩個回傳「表」物件的入口，
  // 而不是預先對固定表名各取一次——因為建立 context 的當下 ensureSchema
  // 通常還沒跑過，表可能還不存在；等表被 insertSheet 建立、或之後被
  // getSheetByName 取用時才包裝，才能保證每一張表、不論何時建立，拿到的
  // getRange 都是有 setValue 的版本。
  function wrapSheetWithSetValueShim(sheet) {
    if (!sheet || sheet.__setValueShimApplied) { return sheet; }
    var originalGetRange = sheet.getRange.bind(sheet);
    sheet.getRange = function (r, c, nr, nc) {
      var range = originalGetRange(r, c, nr, nc);
      if (typeof range.setValue !== 'function') {
        range.setValue = function (value) { return range.setValues([[value]]); };
      }
      return range;
    };
    sheet.__setValueShimApplied = true;
    return sheet;
  }
  var originalGetSheetByName = ss.getSheetByName.bind(ss);
  ss.getSheetByName = function (name) { return wrapSheetWithSetValueShim(originalGetSheetByName(name)); };
  var originalInsertSheet = ss.insertSheet.bind(ss);
  ss.insertSheet = function (name) { return wrapSheetWithSetValueShim(originalInsertSheet(name)); };

  var ctx = vm.createContext(sandbox);
  var order = options.order || listSrcFiles();
  order.forEach(function (f) {
    var full = path.join(SRC_DIR, f);
    vm.runInContext(fs.readFileSync(full, 'utf8'), ctx, { filename: 'src/' + f });
  });
  vm.runInContext(fs.readFileSync(path.join(SRC_DIR, 'Code.js'), 'utf8'), ctx, { filename: 'src/Code.js' });

  // Code.js 的 doGet 會呼叫 ensureSchema，但單篇 RPC 測試通常想自己控制
  // schema 何時建立，所以這裡不自動呼叫 doGet，呼叫端自行決定何時
  // ctx.ensureSchema(ss, null)。
  return { ctx: ctx, ss: ss, cache: cache, lock: lock, properties: properties, drive: drive };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createGasGlobalContext: createGasGlobalContext, listSrcFiles: listSrcFiles };
}
