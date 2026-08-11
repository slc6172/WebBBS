const {
  getOrCreateRootFolder,
  getOrCreateMonthFolder,
  saveArticleImage,
  deleteArticleImage,
  extractFileIdFromUrl,
  ROOT_FOLDER_PROPERTY_KEY
} = require('../src/imageStorage');
const { createFakeDrive } = require('./doubles/fakeDrive');
const { createFakeProperties } = require('./doubles/fakeProperties');

// ---- getOrCreateRootFolder ----

test('getOrCreateRootFolder creates a new folder and writes its id back to properties when none is set', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();

  const folder = getOrCreateRootFolder(drive, properties);

  expect(folder).toBeTruthy();
  expect(properties.get(ROOT_FOLDER_PROPERTY_KEY)).toBe(folder.id);
});

test('getOrCreateRootFolder reuses the existing folder when properties already points at a valid one', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const first = getOrCreateRootFolder(drive, properties);

  const second = getOrCreateRootFolder(drive, properties);

  expect(second.id).toBe(first.id);
  expect(Object.keys(drive._folders).length).toBe(1); // did not create a second folder
});

test('getOrCreateRootFolder creates a fresh folder when the stored id no longer resolves (e.g. manually deleted)', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  properties.set(ROOT_FOLDER_PROPERTY_KEY, 'stale-id-that-does-not-exist');

  const folder = getOrCreateRootFolder(drive, properties);

  expect(folder.id).not.toBe('stale-id-that-does-not-exist');
  expect(properties.get(ROOT_FOLDER_PROPERTY_KEY)).toBe(folder.id);
});

// ---- getOrCreateMonthFolder ----

test('getOrCreateMonthFolder creates a new child folder named after the given month when none exists', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const root = getOrCreateRootFolder(drive, properties);

  const monthFolder = getOrCreateMonthFolder(drive, root, '2026-08');

  expect(monthFolder.name).toBe('2026-08');
  expect(monthFolder.parentId).toBe(root.id);
});

test('getOrCreateMonthFolder reuses an existing same-named child folder instead of creating a duplicate', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const root = getOrCreateRootFolder(drive, properties);
  const first = getOrCreateMonthFolder(drive, root, '2026-08');

  const second = getOrCreateMonthFolder(drive, root, '2026-08');

  expect(second.id).toBe(first.id);
  expect(drive.listSubfolders(root).length).toBe(1);
});

test('getOrCreateMonthFolder creates separate folders for separate months', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const root = getOrCreateRootFolder(drive, properties);

  const aug = getOrCreateMonthFolder(drive, root, '2026-08');
  const sep = getOrCreateMonthFolder(drive, root, '2026-09');

  expect(aug.id).not.toBe(sep.id);
  expect(drive.listSubfolders(root).length).toBe(2);
});

// ---- saveArticleImage ----

test('saveArticleImage stores the file under root/month and returns a fileId + url', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();

  const result = saveArticleImage(drive, properties, 'base64data==', 'image/png', 'photo.png', '2026-08');

  expect(result.fileId).toBeTruthy();
  expect(result.url).toMatch(/^https:\/\//);
  const savedFile = drive._files[result.fileId];
  expect(savedFile.mimeType).toBe('image/png');
  expect(savedFile.fileName).toBe('photo.png');
  const monthFolder = drive._folders[savedFile.folderId];
  expect(monthFolder.name).toBe('2026-08');
});

test('saveArticleImage reuses the same root/month folders across multiple calls in the same month', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();

  saveArticleImage(drive, properties, 'a', 'image/jpeg', 'a.jpg', '2026-08');
  saveArticleImage(drive, properties, 'b', 'image/jpeg', 'b.jpg', '2026-08');

  const folderIds = Object.values(drive._files).map(f => f.folderId);
  expect(folderIds[0]).toBe(folderIds[1]); // both files landed in the same month folder
  expect(Object.keys(drive._folders).length).toBe(2); // just root + one month folder
});

// ---- deleteArticleImage ----

test('deleteArticleImage removes the file by id via the injected drive interface', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const saved = saveArticleImage(drive, properties, 'x', 'image/png', 'x.png', '2026-08');
  expect(drive._files[saved.fileId]).toBeTruthy();

  deleteArticleImage(drive, saved.fileId);

  expect(drive._files[saved.fileId]).toBeUndefined();
});

// ---- extractFileIdFromUrl（優化輪 ticket 10）----
// Articles 表只存連結字串，不另外開欄位存檔案 ID；刪除/替換圖片時要從讀出來
// 的連結反推出真正的 Drive 檔案 ID，才知道要刪哪個檔案。

test('extractFileIdFromUrl pulls the id out of a saveArticleImage-style URL (lh3.googleusercontent.com/d/ format)', () => {
  const drive = createFakeDrive();
  const properties = createFakeProperties();
  const saved = saveArticleImage(drive, properties, 'x', 'image/png', 'x.png', '2026-08');

  expect(extractFileIdFromUrl(saved.url)).toBe(saved.fileId);
});

test('extractFileIdFromUrl also handles the older uc?export=view&id= query-param format, for rows written before the URL format changed', () => {
  expect(extractFileIdFromUrl('https://drive.google.com/uc?export=view&id=old-file-123')).toBe('old-file-123');
});

test('extractFileIdFromUrl returns null for a URL matching neither known format', () => {
  expect(extractFileIdFromUrl('https://example.com/not-a-drive-link')).toBeNull();
});

test('extractFileIdFromUrl returns null for an empty string, null, or undefined', () => {
  expect(extractFileIdFromUrl('')).toBeNull();
  expect(extractFileIdFromUrl(null)).toBeNull();
  expect(extractFileIdFromUrl(undefined)).toBeNull();
});
