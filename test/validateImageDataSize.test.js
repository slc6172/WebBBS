const { validateImageDataSize, MAX_IMAGE_DATA_BYTES } = require('../src/imageStorage');

// 效能/資安複查時發現的問題（見對話紀錄，`/mycr` 深層複掃）：Index.html 的
// 5MB 單張圖片上限只在瀏覽器端檢查，伺服器端的 uploadImageBatch 原本完全
// 沒有對應防線——已經登入且有發文權限的使用者，繞過前端直接呼叫這支端點，
// 可以送出遠大於 5MB 的 base64 payload。這裡驗證純判斷邏輯本身，Code.js
// 的 uploadImageBatch 呼叫這支函式的接線沒有自動化測試（跟其他 Code.js
// glue 一致，見 MANUAL_VERIFICATION.md）。
//
// 用 Buffer 產生剛好已知位元組數的 base64 字串來測邊界，比手動拼湊 base64
// 字串精確、也不用擔心手算錯誤。

test('MAX_IMAGE_DATA_BYTES matches the client-side 5MB limit in Index.html', () => {
  expect(MAX_IMAGE_DATA_BYTES).toBe(5 * 1024 * 1024);
});

test('validateImageDataSize accepts a small, normal-sized payload', () => {
  const base64 = Buffer.alloc(1024, 'a').toString('base64'); // 1KB
  expect(validateImageDataSize(base64)).toEqual({ valid: true });
});

test('validateImageDataSize accepts a payload exactly at the 5MB limit', () => {
  const base64 = Buffer.alloc(5 * 1024 * 1024, 'a').toString('base64');
  expect(validateImageDataSize(base64)).toEqual({ valid: true });
});

test('validateImageDataSize rejects a payload one byte over the 5MB limit', () => {
  const base64 = Buffer.alloc(5 * 1024 * 1024 + 1, 'a').toString('base64');
  expect(validateImageDataSize(base64)).toEqual({ valid: false, error: '圖片檔案大小超過上限' });
});

test('validateImageDataSize rejects a payload well over the limit', () => {
  const base64 = Buffer.alloc(10 * 1024 * 1024, 'a').toString('base64'); // 10MB
  expect(validateImageDataSize(base64)).toEqual({ valid: false, error: '圖片檔案大小超過上限' });
});

test('validateImageDataSize rejects missing, empty, or non-string values without throwing', () => {
  expect(validateImageDataSize(undefined)).toEqual({ valid: false, error: '圖片資料異常' });
  expect(validateImageDataSize(null)).toEqual({ valid: false, error: '圖片資料異常' });
  expect(validateImageDataSize('')).toEqual({ valid: false, error: '圖片資料異常' });
  expect(validateImageDataSize(123)).toEqual({ valid: false, error: '圖片資料異常' });
});
