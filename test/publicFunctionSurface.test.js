const fs = require('fs');
const path = require('path');

// mycr 重掃 F-11：GAS 會把「名稱不以底線結尾」的每個頂層函式都開放給 google.script.run，
// 而這個網站是匿名可存取（ANYONE_ANONYMOUS）——任何人都能在瀏覽器 console 直接呼叫它們。
// 目前需要 spreadsheet/lock/cache 等物件參數的函式，靠「參數無法從瀏覽器序列化」而打不到，
// 這是參數形狀剛好擋住，不是設計防線。這個測試把整個公開介面釘成一份清單：
//   1. 新增任何公開頂層函式，都會讓測試失敗，逼你明確決定它屬於哪一類。
//   2. 「只吃原始型別」的公開純函式，函式本體不得碰任何 GAS 服務（試算表、Drive、
//      快取、鎖、網路、觸發器…），否則匿名使用者可以直接觸發副作用。
//   3. 前端呼叫的每一個 RPC 都必須真的存在，也不能留下前端沒在用的公開入口。

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter(function (f) { return f.endsWith('.js'); }).sort();

// 這幾個參數名稱代表「需要注入的物件」，從瀏覽器序列化過來的 JSON 不可能滿足它們。
const OBJECT_PARAMS = [
  'spreadsheet', 'cache', 'lock', 'drive', 'properties', 'usersSheet', 'sheet', 'ss',
  'digestFn', 'tokenGenerator', 'urlFetch', 'folder', 'fetchFn', 'rootFolder',
  'articlesSheet', 'repliesSheet', 'boardsSheet'
];

// 會產生副作用或存取資料的 GAS 全域服務。只吃原始型別的公開函式不得直接使用。
const GAS_SERVICES = [
  'SpreadsheetApp', 'DriveApp', 'CacheService', 'PropertiesService', 'LockService',
  'UrlFetchApp', 'ScriptApp', 'MailApp', 'GmailApp', 'Session', 'ContentService', 'HtmlService'
];

// 前端 Index.html 實際用 google.script.run 呼叫的伺服器入口。
const RPC_ENTRY_POINTS = [
  'deleteArticleFromForm', 'deleteReplyFromForm', 'editArticleFromForm',
  'getArticleDetailFromToken', 'getBoardBulkFromToken', 'getBoardsFromToken',
  'getLeaderboardFromToken', 'getMyStatus', 'loginFromForm', 'logoutFromForm',
  'markBoardSeenFromToken', 'postArticleFromForm', 'postReplyFromForm',
  'registerUserFromForm', 'uploadImageBatch'
];

// 網頁與 LINE webhook 的 HTTP 入口。
const HTTP_ENTRY_POINTS = ['doGet', 'doPost'];

// 只吃原始型別、不碰任何 GAS 服務的公開純函式（為了讓 Node 測試與 GAS 共用同一份程式碼而公開）。
const PURE_HELPERS = [
  'boardAllowsRole', 'buildDigestTitle', 'buildLineStagingRow', 'classifyLineMessage',
  'compactImageUrls', 'computeNextDigestSequence', 'detectImageType', 'escapeFormulaInjection',
  'excludeRecalled', 'extractFileIdFromUrl', 'formatCanonicalTimestamp', 'formatDigestContent',
  'gateByRole', 'getBoardNewContentStatus', 'getLastSeenBoards', 'hasProcessedEvent',
  'hasResidualContent', 'imageFileExtensionForMimeType', 'isCanonicalTimestamp',
  'isWebhookForThisBot', 'markRecalled', 'normalizePageIndex', 'parseBootstrapParams',
  'parseLooseTimestamp', 'parseWebhookBody', 'resolveGroupBoard', 'resolveImageSlots',
  'resolveLineUserDisplayNames', 'sanitizeForLog', 'shouldCacheBoardPageVersion',
  'shouldHarvest', 'snapshotAllowsBoardArticleRead', 'snapshotIncludesBoard',
  'truncateToLength', 'updateLastSeenBoard', 'validateArticleContent', 'validateArticleTitle',
  'validateImageContent', 'validateImageCount', 'validateImageDataSize',
  'validateImageMimeType', 'validatePassword', 'validateUserId'
];

// 需要注入 spreadsheet/lock/cache/drive 等物件才能運作的公開函式。
const OBJECT_DEPENDENT = [
  'boardAllowsRoleById', 'buildRoleSnapshot', 'bumpArticleVersion', 'bumpBoardVersion',
  'createArticle', 'createReply', 'deleteArticle', 'deleteArticleImage', 'deleteReply',
  'editArticle', 'ensureSchema', 'findArticlePageIndex', 'getArticleById', 'getArticleVersion', 'getArticlesForRole',
  'getBoardVersion', 'getLeaderboard', 'getOrCreateMonthFolder', 'getOrCreateRootFolder',
  'getSessionSnapshot', 'hashPassword', 'incrementUserStat', 'listArticlesByBoard',
  'listBoards', 'listRepliesByArticle', 'putSessionSnapshot', 'removeSessionSnapshot',
  'saveArticleImage', 'verifyPassword'
];

function readFunctions() {
  const result = [];
  files.forEach(function (file) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    const re = /^function ([A-Za-z0-9_]+)\(([^)]*)\)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      const end = text.indexOf('\n}\n', m.index);
      result.push({
        name: m[1],
        file: file,
        params: m[2].split(',').map(function (p) { return p.trim(); }).filter(Boolean),
        body: text.slice(m.index, end === -1 ? text.length : end + 2)
      });
    }
  });
  return result;
}

const publicFunctions = readFunctions().filter(function (f) { return !/_$/.test(f.name); });
const publicNames = publicFunctions.map(function (f) { return f.name; });

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('every public top-level function is classified (a new one must be consciously placed in a category)', () => {
  const known = [].concat(RPC_ENTRY_POINTS, HTTP_ENTRY_POINTS, PURE_HELPERS, OBJECT_DEPENDENT);
  const unclassified = publicNames.filter(function (n) { return known.indexOf(n) === -1; });
  expect(unclassified).toEqual([]);
  const stale = known.filter(function (n) { return publicNames.indexOf(n) === -1; });
  expect(stale).toEqual([]);
});

test('the four categories do not overlap', () => {
  const all = [].concat(RPC_ENTRY_POINTS, HTTP_ENTRY_POINTS, PURE_HELPERS, OBJECT_DEPENDENT);
  expect(new Set(all).size).toBe(all.length);
});

test('no public function name is defined in more than one file', () => {
  const dup = publicNames.filter(function (n, i) { return publicNames.indexOf(n) !== i; });
  expect(dup).toEqual([]);
});

test('object-dependent functions really do take an injected object parameter (otherwise a browser could call them with plain JSON)', () => {
  OBJECT_DEPENDENT.forEach(function (name) {
    const fn = publicFunctions.find(function (f) { return f.name === name; });
    const hasObjectParam = fn.params.some(function (p) { return OBJECT_PARAMS.indexOf(p) !== -1; });
    expect([name, hasObjectParam]).toEqual([name, true]);
  });
});

test('public pure helpers take only primitive parameters AND never touch a GAS service', () => {
  PURE_HELPERS.forEach(function (name) {
    const fn = publicFunctions.find(function (f) { return f.name === name; });
    expect([name, fn.params.some(function (p) { return OBJECT_PARAMS.indexOf(p) !== -1; })]).toEqual([name, false]);
    const code = stripComments(fn.body);
    GAS_SERVICES.forEach(function (svc) {
      expect([name, svc, new RegExp('\\b' + svc + '\\b').test(code)]).toEqual([name, svc, false]);
    });
  });
});

test('every RPC entry point is really called by Index.html (no public endpoint left behind after a UI change)', () => {
  const html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  RPC_ENTRY_POINTS.forEach(function (name) {
    expect([name, new RegExp('\\.\\s*' + name + '\\s*\\(').test(html)]).toEqual([name, true]);
  });
});

test('every RPC entry point takes only primitive parameters (the browser can only send JSON)', () => {
  RPC_ENTRY_POINTS.forEach(function (name) {
    const fn = publicFunctions.find(function (f) { return f.name === name; });
    expect([name, fn.params.some(function (p) { return OBJECT_PARAMS.indexOf(p) !== -1; })]).toEqual([name, false]);
  });
});

test('Index.html only calls server functions that exist (catches typos and renames that would fail silently at runtime)', () => {
  const html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const called = new Set();
  const re = /\)\s*\.\s*([A-Za-z0-9]+(?:FromToken|FromForm))\s*\(/g;
  let m;
  while ((m = re.exec(html)) !== null) { called.add(m[1]); }
  expect(called.size).toBeGreaterThan(5);
  called.forEach(function (name) {
    expect([name, publicNames.indexOf(name) !== -1]).toEqual([name, true]);
  });
});
