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

// 圖片張數突破：文章圖片上限，取代舊有的固定 3 張限制。共用常數，
// resolveImageSlots（編輯路徑）跟 postArticle.js 的 createArticle（新文章
// 路徑）都用同一個數字，避免兩處各寫一次容易兜不起來。
var MAX_IMAGES_PER_ARTICLE = 99;

/**
 * @param {number} count
 * @returns {{valid: boolean, error?: string}}
 */
function validateImageCount(count) {
  if (count > MAX_IMAGES_PER_ARTICLE) {
    return { valid: false, error: '圖片數量超過上限' };
  }
  return { valid: true };
}

// 複審 Finding 1 修復（見對話紀錄）：允許清單本身，明確列舉，不做前綴比對——
// image/svg+xml 這類「開頭是 image/ 但語意上不安全」的格式必須被排除，見下面
// validateImageMimeType 的完整說明。清單只列目前專案裡實際用得到的常見網頁
// 圖片格式，之後真的有需求再加，不預先猜測。
var ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * 安全性審查 M-1 修復延伸 + 複審 Finding 1 修復：uploadImageBatch 原本把
 * 客戶端聲稱的 mimeType 原封不動寫進 Utilities.newBlob，沒有限制只能是
 * 圖片——這支函式只負責純判斷，實際呼叫 Drive 上傳前的攔截點在 Code.js 的
 * uploadImageBatch，兩者合起來才是完整的修復（跟這個檔案其他 validate*
 * 函式一樣的分工：純邏輯留在這裡好測試，GAS 呼叫留在 Code.js）。
 *
 * 複審 Finding 1（見對話紀錄）：第一版用 mimeType.indexOf('image/') === 0
 * 判斷「開頭是不是 image/」，image/svg+xml 完全符合這個條件、會通過驗證——
 * SVG 可以內嵌 <script>/事件處理器，雖然前端一律用 <img> 標籤顯示（瀏覽器
 * 不會執行 <img> 裡 SVG 內嵌的腳本），但檔案上傳到 Drive 後一律設成「知道
 * 連結任何人可看」，如果有人直接開啟該 Drive 連結（不透過 <img>，而是瀏覽器
 * 直接導航），內嵌腳本會在 Drive 的網域下執行，是一個不必要的儲存型內容
 * 注入風險面（不影響本應用自己的 session，但仍是可以避免的攻擊面）。改成
 * 明確列舉允許清單、不再用前綴比對，把這類格式一併排除掉，而不是等出事才
 * 逐一加黑名單。
 * @param {*} mimeType
 * @returns {{valid: boolean, error?: string}}
 */
function validateImageMimeType(mimeType) {
  if (typeof mimeType !== 'string' || ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {
    return { valid: false, error: '檔案格式不支援，僅限圖片' };
  }
  return { valid: true };
}

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

/**
 * 安全性審查 H3 修復。這是原本整個寫在 Code.js 的 resolveImageSlots_
 * 拆出來的純邏輯部分——比照本專案「純邏輯放獨立、可測檔案，GAS glue
 * 留在 Code.js」的既有慣例（跟 editArticle.js/postArticle.js 的分工方式
 * 一致）。之所以要拆出來：Code.js 不會被任何測試檔案 require（見專案
 * 慣例），這正是 H3 那個「客戶端可以塞任意字串進 imageUrl1~3」的漏洞
 * 一直沒被任何測試發現的根本原因——邏輯本身沒有問題，是它活在測試永遠
 * 碰不到的地方。
 *
 * 把前端送來的「圖片格」清單分類（圖片張數突破：原本固定 3 格，現在是
 * 任意長度，上限見 MAX_IMAGES_PER_ARTICLE），但不實際呼叫 Drive 上傳
 * （那一步需要 GAS 的 DriveApp，留給 Code.js 的 resolveImageSlots_ 做）：
 *   - {data, mimeType, fileName} 物件：這是新選的圖片，記下 index，回傳
 *     給呼叫端自己去上傳。
 *   - 字串：代表「保留既有連結」，必須完全等於 existingImageUrls 裡的
 *     其中一個值，或是空字串（代表清空這一格）——不再照單全收客戶端聲稱
 *     的任意字串。不符合就整個拒絕（error 不為 null），呼叫端要整個
 *     拒絕這次編輯請求，不要悄悄把這一格當空白處理。
 * @param {Array} imageSlots
 * @param {Array<string>} [existingImageUrls] - 這篇文章目前的 imageUrls
 *   陣列；省略視為 []。
 * @returns {{resolved: (Array|undefined|null), newImages: Array, newImageSlotIndexes: number[], error: (string|null)}}
 */
/**
 * 圖片張數突破：resolveImageSlots 的輸出仍然是跟輸入等長、可能留有空位的
 * 陣列（例如某一格被移除、或新圖片還沒回填上傳結果前的佔位）。最終要寫進
 * Sheets 的 imageUrls 欄位不留空缺，這支函式在寫入前把空字串濾掉。
 * @param {Array<string>} urls
 * @returns {Array<string>}
 */
function compactImageUrls(urls) {
  return (urls || []).filter(function (u) { return u; });
}

function resolveImageSlots(imageSlots, existingImageUrls) {
  if (!imageSlots) {
    return { resolved: undefined, newImages: [], newImageSlotIndexes: [], error: null };
  }
  var countCheck = validateImageCount(imageSlots.length);
  if (!countCheck.valid) {
    return { resolved: null, newImages: [], newImageSlotIndexes: [], error: countCheck.error };
  }
  var existing = existingImageUrls || [];
  var resolved = new Array(imageSlots.length).fill('');
  var newImages = [];
  var newImageSlotIndexes = [];
  for (var i = 0; i < imageSlots.length; i++) {
    var slot = imageSlots[i];
    if (slot && typeof slot === 'object' && slot.data) {
      newImages.push(slot);
      newImageSlotIndexes.push(i);
    } else if (typeof slot === 'string') {
      if (slot !== '' && existing.indexOf(slot) === -1) {
        return { resolved: null, newImages: [], newImageSlotIndexes: [], error: '圖片資料異常' };
      }
      resolved[i] = slot;
    }
  }
  return { resolved: resolved, newImages: newImages, newImageSlotIndexes: newImageSlotIndexes, error: null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getOrCreateRootFolder: getOrCreateRootFolder,
    getOrCreateMonthFolder: getOrCreateMonthFolder,
    saveArticleImage: saveArticleImage,
    deleteArticleImage: deleteArticleImage,
    extractFileIdFromUrl: extractFileIdFromUrl,
    resolveImageSlots: resolveImageSlots,
    compactImageUrls: compactImageUrls,
    validateImageCount: validateImageCount,
    validateImageMimeType: validateImageMimeType,
    ALLOWED_IMAGE_MIME_TYPES: ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGES_PER_ARTICLE: MAX_IMAGES_PER_ARTICLE,
    ROOT_FOLDER_PROPERTY_KEY: ROOT_FOLDER_PROPERTY_KEY,
    ROOT_FOLDER_NAME: ROOT_FOLDER_NAME
  };
}
