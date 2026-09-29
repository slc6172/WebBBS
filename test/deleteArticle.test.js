const { deleteArticle } = require('../src/deleteArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeDrive } = require('./doubles/fakeDrive');
const { createFakeProperties } = require('./doubles/fakeProperties');
const { saveArticleImage } = require('../src/imageStorage');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '標題', author: 'alice01',
    content: '內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0,
    imageUrls: []
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, JSON.stringify(a.imageUrls)]);
}

function seedReply(sheet, overrides) {
  var defaults = { replyId: 'r1', articleId: 'a1', author: 'bob02', content: '推!', createdAt: '2026/07/30 13:00:00' };
  var r = Object.assign({}, defaults, overrides);
  sheet.appendRow([r.replyId, r.articleId, r.author, r.content, r.createdAt]);
}

test('deleteArticle removes the article and cascades to delete all its replies, leaving unrelated rows intact', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a2' }); // unrelated, should survive
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2', articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r3', articleId: 'a2' }); // unrelated, should survive
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'alice01', 'a1');

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2); // header + a2
  expect(ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('a2');
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2); // header + r3
  expect(ss.getSheetByName('Replies').getRange(2, 1, 1, 1).getValues()[0][0]).toBe('r3');
});

test('deleteArticle deletes the article\'s Drive images too, not just the Sheets row (optimization ticket 10)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const img1 = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const img2 = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', imageUrls: [img1.url, img2.url] });
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1', false, drive);

  expect(drive._files[img1.fileId]).toBeUndefined();
  expect(drive._files[img2.fileId]).toBeUndefined();
});

// ---- 圖片張數突破 ----

test('deleteArticle deletes all Drive images for an article with more than 3 images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const saved = ['a', 'b', 'c', 'd', 'e'].map(function (letter) {
    return saveArticleImage(drive, properties, letter, 'image/png', letter + '.png', '2026-08');
  });
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', imageUrls: saved.map(function (s) { return s.url; }) });
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1', false, drive);

  saved.forEach(function (s) {
    expect(drive._files[s.fileId]).toBeUndefined();
  });
});

test('deleteArticle does not attempt any Drive calls when the article has no images', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' }); // no imageUrl overrides — all blank
  const lock = createFakeLock();

  // drive intentionally omitted (undefined) — must not throw when there's nothing to delete
  expect(() => deleteArticle(ss, lock, 'alice01', 'a1')).not.toThrow();
});

test('deleteArticle rejects a non-owner and deletes nothing', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1' });
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'mallory99', 'a1');

  expect(result).toEqual({ success: false, error: '權限不足' });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(2);
  expect(ss.getSheetByName('Replies').getLastRow()).toBe(2);
});

test('deleteArticle rejects deleting a nonexistent article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'alice01', 'does-not-exist');

  expect(result).toEqual({ success: false, error: '文章不存在' });
});

test('deleteArticle allows a non-owner to delete when isAdmin is true', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
  const lock = createFakeLock();

  const result = deleteArticle(ss, lock, 'admin01', 'a1', true);

  expect(result).toEqual({ success: true });
  expect(ss.getSheetByName('Articles').getLastRow()).toBe(1);
});

test('deleteArticle decrements the article author\'s articleCount, and separately decrements each cascaded reply\'s author\'s replyCount (optimization ticket 08)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r1', articleId: 'a1', author: 'bob02' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r2', articleId: 'a1', author: 'carol03' });
  seedReply(ss.getSheetByName('Replies'), { replyId: 'r3', articleId: 'a1', author: 'bob02' }); // bob02 replied twice
  const usersSheet = ss.getSheetByName('Users');
  usersSheet.appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 3, 0]);
  usersSheet.appendRow(['bob02', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 5]);
  usersSheet.appendRow(['carol03', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 2]);
  const lock = createFakeLock();

  deleteArticle(ss, lock, 'alice01', 'a1');

  const rows = usersSheet.getRange(2, 1, 3, 9).getValues();
  const byId = {};
  rows.forEach(r => { byId[r[0]] = { articleCount: r[7], replyCount: r[8] }; });
  expect(byId['alice01']).toEqual({ articleCount: 2, replyCount: 0 }); // article author, 3 -> 2
  expect(byId['bob02']).toEqual({ articleCount: 0, replyCount: 3 });   // replied twice, 5 -> 3
  expect(byId['carol03']).toEqual({ articleCount: 0, replyCount: 1 }); // replied once, 2 -> 1
});

// mycr 第 15 輪票 13（見 F-14）：刪除含大量回覆的文章時，原本每一則
// 回覆都各自呼叫一次 incrementUserStatFor_（內部又是一次「整欄掃描找
// userId」+ 一次讀目前值 + 一次寫回），SpreadsheetApp 呼叫次數會隨回覆
// 數量線性成長，300 則回覆量測出約 7 次/則、超過 2000 次呼叫，這正是
// 這張票要修的問題（避免長時間佔用全站鎖、避免逼近 GAS 6 分鐘執行上限、
// 避免留下孤兒資料）。
//
// 這裡不直接比對「絕對次數等於多少」（跟實作細節綁太死，之後小幅調整
// 就要跟著改斷言），改成比較「50 則回覆」跟「5 則回覆」兩種情境下的
// SpreadsheetApp 呼叫次數差距——如果呼叫次數真的跟回覆數脫鉤，這個差距
// 應該遠小於回覆數量本身的差距（45 則），而不是接近等比例成長。
function countSpreadsheetCalls_(ss, fn) {
  let calls = 0;
  const wrapSheet = (sheet) => new Proxy(sheet, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return (...args) => {
        calls++;
        const result = value.apply(target, args);
        if (result && typeof result === 'object' && (prop === 'getRange')) {
          return new Proxy(result, {
            get(rt, rp) {
              const rv = rt[rp];
              if (typeof rv !== 'function') return rv;
              return (...rargs) => { calls++; return rv.apply(rt, rargs); };
            }
          });
        }
        return result;
      };
    }
  });
  const spy = { getSheetByName: (name) => wrapSheet(ss.getSheetByName(name)) };
  fn(spy);
  return calls;
}

test('deleteArticle keeps SpreadsheetApp call count roughly constant as reply count grows (batched stats update, not one increment call per reply)', () => {
  function buildScenario(replyCount) {
    const ss = createFakeSpreadsheet();
    ensureSchema(ss);
    seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
    const usersSheet = ss.getSheetByName('Users');
    usersSheet.appendRow(['alice01', 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 1, 0]);
    for (let i = 0; i < replyCount; i++) {
      const author = 'author' + String(i % 10).padStart(2, '0'); // 10 個不同作者輪流
      if (i < 10) usersSheet.appendRow([author, 'h', 's', 'user', "'2026/07/01 00:00:00", 0, '', 0, 5]);
      seedReply(ss.getSheetByName('Replies'), { replyId: 'r' + i, articleId: 'a1', author: author });
    }
    return ss;
  }

  const small = buildScenario(5);
  const large = buildScenario(50);
  const lock1 = createFakeLock();
  const lock2 = createFakeLock();

  const smallCalls = countSpreadsheetCalls_(small, (spy) => deleteArticle(spy, lock1, 'alice01', 'a1'));
  const largeCalls = countSpreadsheetCalls_(large, (spy) => deleteArticle(spy, lock2, 'alice01', 'a1'));

  // 回覆數差了 45 則；如果呼叫次數還是線性跟著回覆數走，largeCalls 應該
  // 比 smallCalls 多出遠大於 45 次（修法前實測約 7 次/則，45 則會多出
  // 超過 300 次）。批次化之後，兩者的差距應該小到跟回覆數本身的差距
  // 不成比例——這裡抓一個遠比「線性成長」寬鬆、但仍然有意義的上限。
  expect(largeCalls - smallCalls).toBeLessThan(45);
});
