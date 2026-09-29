const { editArticle } = require('../src/editArticle');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { createFakeLock } = require('./doubles/fakeLock');
const { createFakeDrive } = require('./doubles/fakeDrive');
const { createFakeProperties } = require('./doubles/fakeProperties');
const { saveArticleImage } = require('../src/imageStorage');

function seedArticle(sheet, overrides) {
  var defaults = {
    articleId: 'a1', boardId: 'gossip', title: '原標題', author: 'alice01',
    content: '原內文', createdAt: '2026/07/30 12:00:00', editedAt: '', editedBy: '', replyCount: 0,
    imageUrls: []
  };
  var a = Object.assign({}, defaults, overrides);
  sheet.appendRow([a.articleId, a.boardId, a.title, a.author, a.content, a.createdAt, a.editedAt, a.editedBy, a.replyCount, JSON.stringify(a.imageUrls)]);
}

function makeUpdates(overrides) {
  return Object.assign({
    title: '新標題',
    content: '新內文',
    editedAt: '2026/07/30 18:00:00'
  }, overrides);
}

test('editArticle updates title/content/editedAt/editedBy when the requester is the owner', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, lock, 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('新標題');
  expect(row[4]).toBe('新內文');
  expect(row[6]).toBe('2026/07/30 18:00:00');
  expect(row[7]).toBe('alice01');
});

test('editArticle force-escapes editedAt to plain text, since it always looks like a date', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ editedAt: '2026/07/30 18:00:00' }));

  const rawRow = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getRawValues()[0];
  expect(rawRow[6]).toBe("'2026/07/30 18:00:00");
});

test('editArticle rejects a non-owner and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, lock, 'mallory99', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '權限不足' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
  expect(row[6]).toBe('');
});

test('editArticle rejects editing a nonexistent article', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);

  const result = editArticle(ss, lock, 'alice01', 'does-not-exist', makeUpdates());

  expect(result).toEqual({ success: false, error: '文章不存在' });
});

test('editArticle rejects an invalid title and makes no changes', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  const result = editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ title: '' }));

  expect(result).toEqual({ success: false, error: '標題不能為空' });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('原標題');
});

test('editArticle allows a non-owner to edit when isAdmin is true, recording editedBy as the admin', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { author: 'alice01' });

  const result = editArticle(ss, lock, 'admin01', 'a1', makeUpdates(), true);

  expect(result).toEqual({ success: true });
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[2]).toBe('新標題');
  expect(row[7]).toBe('admin01');
});

// ---- 圖片管理（優化輪 ticket 10；圖片張數突破輪改成單一 JSON 欄位）----

test('editArticle writes the new imageUrls (compacted, no gaps) when updates.imageUrls is provided', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: ['https://drive.example/new1', '', ''] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(['https://drive.example/new1']);
});

test('editArticle writes "[]" when updates.imageUrls resolves to no images at all', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: ['https://drive.example/kept'] });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: ['', '', ''] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(row[9]).toBe('[]');
});

test('editArticle deletes the Drive file for an image that was removed', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const kept = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const removed = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: [kept.url, removed.url] });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: [kept.url, '', ''] }), false, drive);

  expect(drive._files[removed.fileId]).toBeUndefined(); // removed image's Drive file is gone
  expect(drive._files[kept.fileId]).toBeTruthy();        // kept image's Drive file is untouched
  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual([kept.url]);
});

test('editArticle deletes the Drive file for an image that was replaced by a new one', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const original = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  const replacement = saveArticleImage(drive, properties, 'b', 'image/png', 'b.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: [original.url] });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: [replacement.url, '', ''] }), false, drive);

  expect(drive._files[original.fileId]).toBeUndefined();
  expect(drive._files[replacement.fileId]).toBeTruthy();
});

test('editArticle does not touch Drive at all when the image set is unchanged', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const original = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: [original.url] });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: [original.url, '', ''] }), false, drive);

  expect(drive._files[original.fileId]).toBeTruthy(); // still there, never deleted
});

test('editArticle leaves existing images untouched when updates.imageUrls is not provided at all', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: ['https://drive.example/kept'] });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates()); // no imageUrls field, no drive param

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(['https://drive.example/kept']);
});

// 安全性審查 M1 回歸測試：見 gas-bbs-perf-round-review.md M1。imageUrls 陣列裡
// 每個元素現在跟 title/content 一樣，寫入前要套用 escapeFormulaInjection。
// mycr 第 15 輪票 05：理由跟 createArticleUnlocked.test.js 那個對應測試
// 完全一樣（見該處註解）——imageUrls 整包 JSON.stringify 後才寫進一整格，
// 對陣列元素逐一跳脫從來沒有真的防到 Sheets 層級的任何風險，繼續套用
// 反而會讓合法圖片連結壞掉，已拿掉這裡的跳脫。
test('editArticle stores a formula-injection-shaped imageUrl as-is (the JSON array cell can never itself be misread as a formula)', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: ['=HYPERLINK("evil")', '', ''] }));

  const rawRow = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getRawValues()[0];
  expect(JSON.parse(rawRow[9])).toEqual(['=HYPERLINK("evil")']);
});

test('editArticle does not corrupt normal https:// imageUrls with the new escaping (no-op for legitimate URLs)', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: ['https://drive.example/new1', '', ''] }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(['https://drive.example/new1']);
});

test('editArticle\'s formula-injection escaping does not break the old/new URL diff used for Drive cleanup', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const kept = saveArticleImage(drive, properties, 'a', 'image/png', 'a.png', '2026-08');
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: [kept.url] });

  // 保留同一個既有連結（合法網址不會被 escapeFormulaInjection 動到），
  // 確保新加的跳脫邏輯不會讓「有沒有真的換圖」的比對誤判成有換掉。
  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: [kept.url, '', ''] }), false, drive);

  expect(drive._files[kept.fileId]).toBeTruthy(); // 不該被誤判成「被替換」而砍掉
});

// ---- 圖片張數突破：任意長度 ----

test('editArticle handles more than 3 images: writes all of them, compacted, no gaps', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  seedArticle(ss.getSheetByName('Articles'), {});
  const fiveUrls = ['1', '2', '3', '4', '5'].map(function (n) { return 'https://drive.example/' + n; });

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: fiveUrls }));

  const row = ss.getSheetByName('Articles').getRange(2, 1, 1, 10).getValues()[0];
  expect(JSON.parse(row[9])).toEqual(fiveUrls);
});

test('editArticle correctly diffs old vs. new image sets when there are more than 3 images, deleting only the ones actually removed', () => {
  const ss = createFakeSpreadsheet();
  const lock = createFakeLock();
  ensureSchema(ss);
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const saved = ['a', 'b', 'c', 'd', 'e'].map(function (letter) {
    return saveArticleImage(drive, properties, letter, 'image/png', letter + '.png', '2026-08');
  });
  seedArticle(ss.getSheetByName('Articles'), { imageUrls: saved.map(function (s) { return s.url; }) });

  // 保留前 3 張、移除第 4、5 張
  const kept = saved.slice(0, 3).map(function (s) { return s.url; });
  editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ imageUrls: kept }), false, drive);

  expect(drive._files[saved[0].fileId]).toBeTruthy();
  expect(drive._files[saved[1].fileId]).toBeTruthy();
  expect(drive._files[saved[2].fileId]).toBeTruthy();
  expect(drive._files[saved[3].fileId]).toBeUndefined();
  expect(drive._files[saved[4].fileId]).toBeUndefined();
});

// mycr 第 15 輪票 12（見 F-09）：editArticle 原本完全不取鎖，用「早先
// 查到的列號」直接寫入——如果在「查到列號」跟「真正寫入」這段時間內，
// 剛好有另一個操作（例如 deleteArticle，持鎖、會用 deleteRow 讓後面
// 所有列的列號往前位移）刪除了更早的一列，editArticle 就會把編輯結果
// 寫到別人的文章上。修法：取全站鎖，鎖內重新定位列號後才寫入。
//
// 這裡不直接呼叫 deleteArticle_（保持這個測試檔只依賴 editArticle.js
// 本身），改成攔截 lock.waitLock 本身，在 editArticle 真正拿到鎖的那一
// 刻，用 deleteRow 模擬「就在這之前，另一個持鎖的操作剛好完成、刪掉了
// 更早的一列」這個時間點——這正是修法要防的那個時間窗。
test('editArticle re-locates the article by articleId after acquiring the lock, so a row deleted by a concurrent operation between the initial lookup and the write does not cause the edit to land on the wrong article', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  const articles = ss.getSheetByName('Articles');
  seedArticle(articles, { articleId: 'a0', title: '即將被刪除的文章', author: 'alice01' }); // row 2
  seedArticle(articles, { articleId: 'a1', title: '原標題', author: 'alice01' }); // row 3（正要編輯的文章）
  seedArticle(articles, { articleId: 'a2', title: '不該被動到的受害者文章', author: 'bob0002' }); // row 4

  const originalWaitLock = lock.waitLock.bind(lock);
  lock.waitLock = function (timeout) {
    originalWaitLock(timeout);
    // 模拟：editArticle 剛拿到鎖的這一刻，另一個持鎖的操作（例如
    // deleteArticle）碰巧就在這之前完成，刪除了 a0（row 2），讓 a1/a2
    // 都往前位移一列。
    articles.deleteRow(2);
  };

  const result = editArticle(ss, lock, 'alice01', 'a1', makeUpdates({ title: '新標題（鎖內重新定位後應該落在這裡）' }));

  expect(result.success).toBe(true);

  const remaining = articles.getRange(2, 1, articles.getLastRow() - 1, 10).getValues();
  const byId = {};
  remaining.forEach(function (row) { byId[row[0]] = row; });

  expect(byId.a1[2]).toBe('新標題（鎖內重新定位後應該落在這裡）'); // 編輯結果要落在 a1 身上
  expect(byId.a2[2]).toBe('不該被動到的受害者文章'); // a2 完全不受影響
});

test('editArticle returns an error (not a crash) when the article is deleted by a concurrent operation between the initial lookup and the lock-protected re-read', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  const articles = ss.getSheetByName('Articles');
  seedArticle(articles, { articleId: 'a1', title: '原標題', author: 'alice01' }); // row 2

  const originalWaitLock = lock.waitLock.bind(lock);
  lock.waitLock = function (timeout) {
    originalWaitLock(timeout);
    articles.deleteRow(2); // 模擬鎖內重新確認時，文章已經被整個刪除
  };

  const result = editArticle(ss, lock, 'alice01', 'a1', makeUpdates());

  expect(result).toEqual({ success: false, error: '文章不存在' });
});

test('editArticle releases the lock even when an error is returned after the lock is acquired', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  const lock = createFakeLock();
  seedArticle(ss.getSheetByName('Articles'), { articleId: 'a1', author: 'alice01' });
  let releaseLockCallCount = 0;
  const originalReleaseLock = lock.releaseLock.bind(lock);
  lock.releaseLock = function () { releaseLockCallCount++; return originalReleaseLock(); };
  const originalWaitLock = lock.waitLock.bind(lock);
  lock.waitLock = function (timeout) {
    originalWaitLock(timeout);
    ss.getSheetByName('Articles').deleteRow(2); // 讓鎖內重新查詢失敗，測試釋放鎖的路徑
  };

  editArticle(ss, lock, 'alice01', 'a1', makeUpdates());

  expect(releaseLockCallCount).toBe(1);
});
