const {
  detectImageType,
  validateImageContent,
  imageFileExtensionForMimeType
} = require('../src/imageStorage');

// mycr 重掃 F-04：uploadImageBatch 原本只信任客戶端宣稱的 mimeType，
// base64 內容從未檢查。這裡驗證「看檔頭的魔術位元組」這個純判斷邏輯；
// Code.js 的接線沒有自動化測試（跟其他 glue 一致，見 MANUAL_VERIFICATION.md）。

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 1, 0, 1, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20];

describe('detectImageType', () => {
  test('recognises the four allowed formats from their magic bytes', () => {
    expect(detectImageType(b64(PNG))).toBe('image/png');
    expect(detectImageType(b64(JPEG))).toBe('image/jpeg');
    expect(detectImageType(b64(GIF89))).toBe('image/gif');
    expect(detectImageType(b64(GIF87))).toBe('image/gif');
    expect(detectImageType(b64(WEBP))).toBe('image/webp');
  });

  test('rejects HTML, SVG, scripts and PDF disguised as images', () => {
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>').toString('base64'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7 fake content here').toString('base64'))).toBeNull();
    expect(detectImageType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00').toString('base64'))).toBeNull();
  });

  test('a RIFF container that is not WEBP (e.g. WAV/AVI) is rejected', () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20];
    expect(detectImageType(b64(wav))).toBeNull();
  });

  test('too-short, empty, non-string and non-base64 input fail safe to null (never throws)', () => {
    expect(detectImageType('')).toBeNull();
    expect(detectImageType('iVBO')).toBeNull();
    expect(detectImageType(null)).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
    expect(detectImageType(12345)).toBeNull();
    expect(detectImageType({ length: 100 })).toBeNull();
    expect(detectImageType('!!!!!!!!!!!!!!!!!!!!!!!!')).toBeNull();
  });

  test('only the header is inspected, so a huge payload costs the same as a tiny one', () => {
    const big = b64(PNG) + 'A'.repeat(6 * 1024 * 1024);
    expect(detectImageType(big)).toBe('image/png');
  });
});

describe('validateImageContent', () => {
  test('returns the DETECTED mime type, ignoring a wrong claim, so a PNG named .jpg still uploads (no regression for mislabelled real images)', () => {
    expect(validateImageContent(b64(PNG), 'image/jpeg')).toEqual({ valid: true, mimeType: 'image/png' });
    expect(validateImageContent(b64(JPEG), 'image/jpeg')).toEqual({ valid: true, mimeType: 'image/jpeg' });
  });

  test('rejects content that is not one of the allowed image formats, whatever the claimed type', () => {
    const html = Buffer.from('<html><body>x</body></html>').toString('base64');
    expect(validateImageContent(html, 'image/png')).toEqual({ valid: false, error: '檔案內容不是支援的圖片格式' });
    expect(validateImageContent('', 'image/png')).toEqual({ valid: false, error: '檔案內容不是支援的圖片格式' });
    expect(validateImageContent(undefined, 'image/png')).toEqual({ valid: false, error: '檔案內容不是支援的圖片格式' });
  });
});

describe('imageFileExtensionForMimeType', () => {
  test('maps allowed types to a fixed extension and anything else to a safe default', () => {
    expect(imageFileExtensionForMimeType('image/png')).toBe('png');
    expect(imageFileExtensionForMimeType('image/jpeg')).toBe('jpg');
    expect(imageFileExtensionForMimeType('image/gif')).toBe('gif');
    expect(imageFileExtensionForMimeType('image/webp')).toBe('webp');
    expect(imageFileExtensionForMimeType('text/html')).toBe('bin');
    expect(imageFileExtensionForMimeType(undefined)).toBe('bin');
  });
});
