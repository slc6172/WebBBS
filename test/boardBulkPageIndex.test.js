const { normalizePageIndex, shouldCacheBoardPageVersion } = require('../src/boardBulk');

// mycr 重掃 F-06：getBoardBulkFromToken 原本把客戶端傳的 pageIndex 原樣串進
// CacheService 的 key，已登入的讀者可用任意字串無限建立快取項目。
// 這裡驗證抽出來的兩個純函式；Code.js 的接線靠手動驗收。

describe('normalizePageIndex', () => {
  test('keeps ordinary non-negative integers', () => {
    expect(normalizePageIndex(0)).toBe(0);
    expect(normalizePageIndex(7)).toBe(7);
    expect(normalizePageIndex('3')).toBe(3);
  });

  test('collapses every spelling of the same page to one canonical number', () => {
    expect(normalizePageIndex('03')).toBe(3);
    expect(normalizePageIndex(' 3 ')).toBe(3);
    expect(normalizePageIndex('3.9')).toBe(3);
    expect(normalizePageIndex(3.9)).toBe(3);
  });

  test('negative, NaN, non-numeric, null and object input fall back to page 0', () => {
    expect(normalizePageIndex(-5)).toBe(0);
    expect(normalizePageIndex('abc')).toBe(0);
    expect(normalizePageIndex(NaN)).toBe(0);
    expect(normalizePageIndex(null)).toBe(0);
    expect(normalizePageIndex(undefined)).toBe(0);
    expect(normalizePageIndex({})).toBe(0);
    expect(normalizePageIndex([1, 2])).toBe(0);
    expect(normalizePageIndex(Infinity)).toBe(0);
  });

  test('the result is always a safe integer, so it can never produce an overlong or odd cache key', () => {
    expect(String(normalizePageIndex('9'.repeat(400)))).toMatch(/^\d{1,16}$/);
  });
});

describe('shouldCacheBoardPageVersion', () => {
  test('page 0 is always cached (an empty board still has a page 0)', () => {
    expect(shouldCacheBoardPageVersion(0, 0)).toBe(true);
    expect(shouldCacheBoardPageVersion(0, 5)).toBe(true);
  });

  test('a later page is cached only when it really contains articles', () => {
    expect(shouldCacheBoardPageVersion(3, 20)).toBe(true);
    expect(shouldCacheBoardPageVersion(3, 0)).toBe(false);
    expect(shouldCacheBoardPageVersion(99999, 0)).toBe(false);
  });
});
