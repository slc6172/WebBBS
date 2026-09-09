const { validateImageMimeType, ALLOWED_IMAGE_MIME_TYPES } = require('../src/imageStorage');

// 安全性審查 M-1 修復：uploadImageBatch 原本沒有限制客戶端聲稱的 mimeType，
// 這裡驗證純判斷邏輯本身，Code.js 的 uploadImageBatch 呼叫這支函式的接線
// 沒有自動化測試（跟其他 Code.js glue 一致，見 MANUAL_VERIFICATION.md）。
//
// 複審 Finding 1 修復：第一版用「開頭是不是 image/」判斷，image/svg+xml 會
// 通過驗證——SVG 可以內嵌 <script>，上傳到 Drive 後設成連結公開可看，直接
// 開啟連結（不透過 <img>）會在 Drive 網域下執行內嵌腳本，見對話紀錄。改成
// 明確列舉允許清單，下面補上這個回歸測試，之後有人不小心把驗證邏輯改回
// 前綴比對，這個測試會抓到。

test('ALLOWED_IMAGE_MIME_TYPES is the explicit allow-list (not a prefix match)', () => {
  expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
});

test('validateImageMimeType accepts common image mime types', () => {
  expect(validateImageMimeType('image/png')).toEqual({ valid: true });
  expect(validateImageMimeType('image/jpeg')).toEqual({ valid: true });
  expect(validateImageMimeType('image/gif')).toEqual({ valid: true });
  expect(validateImageMimeType('image/webp')).toEqual({ valid: true });
});

test('validateImageMimeType rejects non-image mime types', () => {
  expect(validateImageMimeType('text/html')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType('application/javascript')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType('application/pdf')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
});

test('validateImageMimeType rejects image/svg+xml even though it starts with "image/" (regression test for Finding 1)', () => {
  // SVG 可以內嵌 <script>/事件處理器，直接開啟 Drive 連結時會在 Drive 網域下
  // 執行——這個測試專門守住「不能退回用前綴比對」這件事本身
  expect(validateImageMimeType('image/svg+xml')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
});

test('validateImageMimeType rejects other image formats not on the explicit allow-list', () => {
  // 明確列舉之後，清單外的格式（即使技術上安全，例如 bmp/tiff/x-icon）
  // 也一律拒絕——沒有需求就不預先加，見上面函式註解
  expect(validateImageMimeType('image/bmp')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType('image/tiff')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
});

test('validateImageMimeType rejects a value that merely contains "image/" without matching an allowed type', () => {
  // 防止用「字串裡有沒有出現 image/」這種寬鬆判斷被繞過
  expect(validateImageMimeType('text/html; charset=image/fake')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
});

test('validateImageMimeType rejects missing, empty, or non-string values', () => {
  expect(validateImageMimeType(undefined)).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType(null)).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType('')).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
  expect(validateImageMimeType(123)).toEqual({ valid: false, error: '檔案格式不支援，僅限圖片' });
});
