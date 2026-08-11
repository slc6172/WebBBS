/**
 * 優化輪 ticket 09（#2）— 文章圖片存到 Google Drive，Articles 表只存連結
 * 字串。這是本專案第一次要包裝 DriveApp/PropertiesService，比照既有的
 * SpreadsheetApp/LockService/CacheService 依賴注入慣例：注入的 drive/
 * properties 物件把所有會碰到真實 Google 服務的操作包起來，Node 測試時用
 * 手刻假物件（見 test/doubles/fakeDrive.js、fakeProperties.js）替換掉，不
 * 用連線真實 Google Drive。
 *
 * 注入的 drive 介面（呼叫端在 GAS 環境用 DriveApp 包出來）：
 *   - getFolderById(id) -> Folder|null
 *   - createFolder(parentFolderOrNull, name) -> Folder（parent 傳 null 代表建在 Drive 根目錄）
 *   - listSubfolders(parentFolder) -> {id, name}[]
 *   - saveFile(folder, base64Data, mimeType, fileName) -> {id, url}
 *   - deleteFile(fileId) -> void
 *
 * 注入的 properties 介面（呼叫端在 GAS 環境用 PropertiesService.getScriptProperties() 包出來）：
 *   - get(key) -> string|null
 *   - set(key, value) -> void
 */

var ROOT_FOLDER_PROPERTY_KEY = 'IMAGE_ROOT_FOLDER_ID';
var ROOT_FOLDER_NAME = 'BBS 圖片';

/**
 * 取得圖片根資料夾；指令碼屬性沒設定過，或設定的 ID 已經失效（例如資料夾被
 * 手動刪除），都視為「尚未設定」，自動建立一個新資料夾並把 ID 寫回指令碼屬性。
 * 部署者隨時可以把指令碼屬性改成別的既有資料夾 ID，下次呼叫就會沿用那個。
 * @param {Drive} drive
 * @param {Properties} properties
 * @returns {Folder}
 */
function getOrCreateRootFolder(drive, properties) {
  var existingId = properties.get(ROOT_FOLDER_PROPERTY_KEY);
  if (existingId) {
    var existing = drive.getFolderById(existingId);
    if (existing) {
      return existing;
    }
  }
  var created = drive.createFolder(null, ROOT_FOLDER_NAME);
  properties.set(ROOT_FOLDER_PROPERTY_KEY, created.id);
  return created;
}

/**
 * 取得根資料夾底下、指定月份（格式 YYYY-MM）對應的子資料夾，不存在就建立。
 * @param {Drive} drive
 * @param {Folder} rootFolder
 * @param {string} yyyyMM
 * @returns {Folder}
 */
function getOrCreateMonthFolder(drive, rootFolder, yyyyMM) {
  var children = drive.listSubfolders(rootFolder);
  for (var i = 0; i < children.length; i++) {
    if (children[i].name === yyyyMM) {
      return drive.getFolderById(children[i].id);
    }
  }
  return drive.createFolder(rootFolder, yyyyMM);
}

/**
 * 把一張圖片存進「根資料夾/月份子資料夾」，回傳檔案 ID 與可檢視連結。
 * @param {Drive} drive
 * @param {Properties} properties
 * @param {string} base64Data
 * @param {string} mimeType
 * @param {string} fileName
 * @param {string} yyyyMM - 呼叫端（GAS 環境才有真實時鐘，Asia/Taipei 時區）算好傳進來
 * @returns {{fileId: string, url: string}}
 */
function saveArticleImage(drive, properties, base64Data, mimeType, fileName, yyyyMM) {
  var root = getOrCreateRootFolder(drive, properties);
  var monthFolder = getOrCreateMonthFolder(drive, root, yyyyMM);
  var saved = drive.saveFile(monthFolder, base64Data, mimeType, fileName);
  return { fileId: saved.id, url: saved.url };
}

/**
 * @param {Drive} drive
 * @param {string} fileId
 */
function deleteArticleImage(drive, fileId) {
  drive.deleteFile(fileId);
}

/**
 * 從 saveArticleImage 產生的檢視連結中還原出 Drive 檔案 ID，供刪除/替換圖片時
 * 使用——Articles 表只存連結字串，沒有另外開欄位存檔案 ID。優先比對目前使用的
 * lh3.googleusercontent.com/d/FILE_ID 路徑格式；也相容舊格式
 * （uc?export=view&id=FILE_ID）的查詢參數，讓優化上線前就寫入的舊連結還是
 * 能正確反推出檔案 ID。兩種格式都不符合（或根本不是字串）時回傳 null，
 * 呼叫端看到 null 就跳過，不嘗試刪除。
 * @param {string} url
 * @returns {string|null}
 */
function extractFileIdFromUrl(url) {
  if (typeof url !== 'string') {
    return null;
  }
  var pathMatch = url.match(/\/d\/([^/?]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  var queryMatch = url.match(/[?&]id=([^&]+)/);
  return queryMatch ? queryMatch[1] : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getOrCreateRootFolder: getOrCreateRootFolder,
    getOrCreateMonthFolder: getOrCreateMonthFolder,
    saveArticleImage: saveArticleImage,
    deleteArticleImage: deleteArticleImage,
    extractFileIdFromUrl: extractFileIdFromUrl,
    ROOT_FOLDER_PROPERTY_KEY: ROOT_FOLDER_PROPERTY_KEY,
    ROOT_FOLDER_NAME: ROOT_FOLDER_NAME
  };
}
