const { resolveImageSlots } = require('../src/imageStorage');

// 安全性審查 H3：見 gas-bbs-perf-round-review.md H3。這支純函式是原本整個
// 寫在 Code.js（不受任何測試覆蓋）的 resolveImageSlots_ 拆出來的驗證邏輯，
// 這裡直接測試那個漏洞本身——客戶端聲稱「保留既有連結」的字串，現在
// 必須真的等於這篇文章既有的 imageUrl 之一。

test('resolveImageSlots returns {resolved: undefined} when imageSlots is omitted entirely', () => {
  expect(resolveImageSlots(undefined, ['a', 'b', ''])).toEqual({
    resolved: undefined, newImages: [], newImageSlotIndexes: [], error: null
  });
});

test('resolveImageSlots keeps a string slot that matches one of the article\'s existing image URLs', () => {
  const result = resolveImageSlots(
    ['https://lh3.googleusercontent.com/d/abc', '', ''],
    ['https://lh3.googleusercontent.com/d/abc', '', '']
  );

  expect(result).toEqual({
    resolved: ['https://lh3.googleusercontent.com/d/abc', '', ''],
    newImages: [], newImageSlotIndexes: [], error: null
  });
});

test('resolveImageSlots treats an empty-string slot as "clear this slot", always allowed regardless of existing URLs', () => {
  const result = resolveImageSlots(['', '', ''], ['https://lh3.googleusercontent.com/d/abc', '', '']);

  expect(result).toEqual({ resolved: ['', '', ''], newImages: [], newImageSlotIndexes: [], error: null });
});

test('resolveImageSlots collects object slots ({data, mimeType, fileName}) as pending new uploads, not as "kept" strings', () => {
  const slot = { data: 'base64==', mimeType: 'image/png', fileName: 'a.png' };
  const result = resolveImageSlots([slot, '', ''], ['', '', '']);

  expect(result.error).toBeNull();
  expect(result.newImages).toEqual([slot]);
  expect(result.newImageSlotIndexes).toEqual([0]);
  expect(result.resolved[0]).toBe(''); // 上傳後才會知道真正的網址，這裡先留空，由 Code.js 補
});

// ---- H3 核心：拒絕任意字串 ----

test('resolveImageSlots rejects a string slot that does not match any of the article\'s existing image URLs', () => {
  const result = resolveImageSlots(
    ['https://evil.example/not-really-an-image', '', ''],
    ['https://lh3.googleusercontent.com/d/abc', '', '']
  );

  expect(result.error).toBe('圖片資料異常');
  expect(result.resolved).toBeNull();
});

test('resolveImageSlots rejects when existingImageUrls is omitted (no article found) and a non-empty string is claimed', () => {
  const result = resolveImageSlots(['https://lh3.googleusercontent.com/d/abc', '', ''], undefined);

  expect(result.error).toBe('圖片資料異常');
});

test('resolveImageSlots rejects the classic H3 attack payload: a crafted URL string embedding an arbitrary Drive file ID', () => {
  // 這個字串如果沒被擋下，串起 Index.html 的 renderArticleImages（儲存型
  // XSS）跟 imageStorage.js 的 extractFileIdFromUrl（刪除文章時會拿它去
  // 反推 Drive 檔案 ID 並刪除，見審查報告 H3 的完整攻擊鏈分析）。
  const result = resolveImageSlots(
    ["https://lh3.googleusercontent.com/d/SOME-VICTIM-FILE-ID", '', ''],
    ['', '', '']
  );

  expect(result.error).toBe('圖片資料異常');
  expect(result.resolved).toBeNull();
});

test('resolveImageSlots rejects an XSS-shaped string even when it happens to be in one of the other slots', () => {
  const result = resolveImageSlots(
    ['', "'); alert(document.cookie); //", ''],
    ['https://lh3.googleusercontent.com/d/abc', '', '']
  );

  expect(result.error).toBe('圖片資料異常');
});

test('resolveImageSlots rejects as soon as any one slot is invalid, even if the other two are fine', () => {
  const result = resolveImageSlots(
    ['https://lh3.googleusercontent.com/d/abc', 'not-a-real-existing-url', ''],
    ['https://lh3.googleusercontent.com/d/abc', '', '']
  );

  expect(result.error).toBe('圖片資料異常');
});

// ---- 圖片張數突破：任意長度陣列 ----

test('resolveImageSlots handles more than 3 slots, mixing kept strings and new uploads', () => {
  const slot = { data: 'base64==', mimeType: 'image/png', fileName: 'c.png' };
  const result = resolveImageSlots(
    ['https://lh3.googleusercontent.com/d/a', 'https://lh3.googleusercontent.com/d/b', slot, '', 'https://lh3.googleusercontent.com/d/c'],
    ['https://lh3.googleusercontent.com/d/a', 'https://lh3.googleusercontent.com/d/b', 'https://lh3.googleusercontent.com/d/c']
  );

  expect(result.error).toBeNull();
  expect(result.resolved).toEqual(['https://lh3.googleusercontent.com/d/a', 'https://lh3.googleusercontent.com/d/b', '', '', 'https://lh3.googleusercontent.com/d/c']);
  expect(result.newImages).toEqual([slot]);
  expect(result.newImageSlotIndexes).toEqual([2]);
});

test('resolveImageSlots rejects a submission with more than 99 slots, before checking any individual slot', () => {
  const tooMany = new Array(100).fill('');

  const result = resolveImageSlots(tooMany, []);

  expect(result).toEqual({ resolved: null, newImages: [], newImageSlotIndexes: [], error: '圖片數量超過上限' });
});

test('resolveImageSlots accepts exactly 99 slots', () => {
  const exactlyMax = new Array(99).fill('');

  const result = resolveImageSlots(exactlyMax, []);

  expect(result.error).toBeNull();
  expect(result.resolved).toEqual(exactlyMax);
});

test('resolveImageSlots allows mixing a kept existing string with a brand-new upload object in different slots', () => {
  const slot = { data: 'base64==', mimeType: 'image/png', fileName: 'b.png' };
  const result = resolveImageSlots(
    ['https://lh3.googleusercontent.com/d/abc', slot, ''],
    ['https://lh3.googleusercontent.com/d/abc', '', '']
  );

  expect(result.error).toBeNull();
  expect(result.resolved[0]).toBe('https://lh3.googleusercontent.com/d/abc');
  expect(result.newImages).toEqual([slot]);
  expect(result.newImageSlotIndexes).toEqual([1]);
});
