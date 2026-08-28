// GAS entry point. Wires the unit-tested seam functions in schema.js /
// ping.js / bootstrap.js to the real GAS APIs (SpreadsheetApp,
// HtmlService). All .js files in a clasp project share one global
// namespace at runtime, so ensureSchema / pingRoundTrip /
// parseBootstrapParams are directly callable here without any import.
//
// This file is intentionally thin glue: it is NOT covered by the Node
// unit tests (SpreadsheetApp/HtmlService only exist inside the Apps
// Script runtime), so it's verified manually — see MANUAL_VERIFICATION.md.
//
// 兩個貫穿全專案、寫新程式碼時要延續的慣例（優化輪期間重新確認過，見對話紀錄）：
//   1. 寫入 Sheets 的任何時間戳記字串（createdAt/editedAt/lastLoginAt...），一律用
//      "'" + value 強制純文字，避免 Sheets 自動把看起來像日期的字串轉成 Date 物件。
//      新增任何會寫時間戳記的欄位時，記得同時把該欄位加進 schema.js 的
//      TIMESTAMP_COLUMNS 做雙重保險（setNumberFormat('@')）。
//   2. 任何 google.script.run 回傳的內容，只要含陣列或巢狀物件（不論大小、不分
//      筆數門檻），一律用 JSON.stringify 包起來，前端對應 JSON.parse。只有像
//      getMyStatus 那種幾個純量欄位的小扁平物件才維持直接回傳。這是因為
//      google.script.run 對複雜物件的序列化行為不可靠（曾經直接回傳 null 給
//      前端），與其猜測確切的觸發門檻，不如統一處理。

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * 權限系統 ticket 01：ensureSchema 用來套用 Users.role 下拉選單的規則產生
 * 函式。SpreadsheetApp.newDataValidation() 是掛在全域命名空間上的靜態工
 * 廠方法，不是掛在任何 spreadsheet 實例上，schema.js 沒辦法在不打破既有
 * 依賴注入慣例的前提下直接呼叫它，所以由這裡（Code.js 膠水層）注入。
 */
function buildRoleValidationRule_(roleNames) {
  return SpreadsheetApp.newDataValidation().requireValueInList(roleNames, true).build();
}

/**
 * 優化輪：找到 Boards 表裡 boardId 對應的列號（1-indexed），找不到回傳 -1。
 */
function findBoardRow_(boardsSheet, boardId) {
  var lastRow = boardsSheet.getLastRow();
  if (lastRow < 2) {
    return -1;
  }
  var ids = boardsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === boardId) {
      return i + 2;
    }
  }
  return -1;
}

/**
 * 看板列表新內容提示功能：發文/編輯文章/回覆成功時，更新該看板的
 * latestArticleAt（欄位 5）或 latestReplyAt（欄位 6）。只往前推進，不做
 * 刪除時的回溯重算——見對話紀錄的取捨說明。刻意不上鎖，理由同 loginCount：
 * 純顯示用途，不影響權限判斷，允許極端併發下的些微誤差。
 * @param {Sheet} boardsSheet
 * @param {string} boardId
 * @param {number} column - 5 = latestArticleAt, 6 = latestReplyAt
 * @param {string} timestamp
 */
function bumpBoardActivity_(boardsSheet, boardId, column, timestamp) {
  var row = findBoardRow_(boardsSheet, boardId);
  if (row === -1) {
    return; // 看板不存在（理論上不該發生），安靜跳過，不讓發文/回覆操作因此失敗
  }
  boardsSheet.getRange(row, column, 1, 1).setValue("'" + timestamp);
}

var BOARD_LATEST_ARTICLE_AT_COLUMN = 5;
var BOARD_LATEST_REPLY_AT_COLUMN = 6;

/**
 * 優化輪 ticket 09（#2）：把真實的 DriveApp 包成 imageStorage.js 期待的
 * drive 介面。getFolderById 特別包了 try/catch——真實 DriveApp 對不存在的
 * ID 是丟例外，不是回傳 null，這裡轉換成 imageStorage.js 測試時假設的
 * 「找不到就回傳 null」介面。
 */
function createDriveInterface_() {
  return {
    getFolderById: function (id) {
      try {
        return DriveApp.getFolderById(id);
      } catch (e) {
        return null;
      }
    },
    createFolder: function (parentFolder, name) {
      var created = parentFolder ? parentFolder.createFolder(name) : DriveApp.createFolder(name);
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return created;
    },
    listSubfolders: function (parentFolder) {
      var result = [];
      var it = parentFolder.getFolders();
      while (it.hasNext()) {
        var f = it.next();
        result.push({ id: f.getId(), name: f.getName() });
      }
      return result;
    },
    saveFile: function (folder, base64Data, mimeType, fileName) {
      var bytes = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(bytes, mimeType, fileName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // 優化輪 ticket 09：圖片連結格式。試過 uc?export=view（被 Google 擋下，回傳
      // 警告頁面而不是圖片）跟 thumbnail?id=（實測也不行），最後用這個
      // lh3.googleusercontent.com/d/ 格式，使用者實測有效
      return { id: file.getId(), url: 'https://lh3.googleusercontent.com/d/' + file.getId() };
    },
    deleteFile: function (fileId) {
      try {
        DriveApp.getFileById(fileId).setTrashed(true);
      } catch (e) {
        // 檔案可能已經被刪過或 ID 本來就無效，安靜略過，不讓刪文章操作因此失敗
      }
    }
  };
}

function createPropertiesInterface_() {
  var props = PropertiesService.getScriptProperties();
  return {
    get: function (key) { return props.getProperty(key); },
    set: function (key, value) { props.setProperty(key, value); }
  };
}

/**
 * 把前端送來的圖片（最多 MAX_IMAGES_PER_ARTICLE 張，{data(base64), mimeType,
 * fileName}）逐一存進 Drive，回傳對應的可檢視連結陣列。images 為空/未提供時
 * 回傳空陣列。圖片張數突破：原本寫死 3 張，現在跟 imageStorage.js 共用同一
 * 個上限常數（目前是 99）。
 */
function uploadArticleImages_(images) {
  if (!images || images.length === 0) {
    return [];
  }
  var drive = createDriveInterface_();
  var properties = createPropertiesInterface_();
  var yyyyMM = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  var urls = [];
  for (var i = 0; i < Math.min(images.length, MAX_IMAGES_PER_ARTICLE); i++) {
    var img = images[i];
    var saved = saveArticleImage(drive, properties, img.data, img.mimeType, img.fileName, yyyyMM);
    urls.push(saved.url);
  }
  return urls;
}

// ---- 圖片自動分批上傳：session 專屬的「已上傳、還沒寫進文章」連結清單 ----
// 前端把發文/編輯時選的圖片依大小切成多個批次，依序呼叫 uploadImageBatch
// 個別上傳（見 Index.html 的 uploadImagesInBatches），最後送出文章內容的
// 那次呼叫（postArticleFromForm/editArticleFromForm）收到的就已經是連結
// 字串，不再是 base64。
//
// 安全性審查 H3 修復是「編輯文章時，客戶端聲稱要保留的既有連結字串，必須
// 真的等於這篇文章目前的 imageUrls 之一，否則整個拒絕」（見 imageStorage.js
// 的 resolveImageSlots）——本意是不讓客戶端偽造任意字串充當「已經合法
// 上傳的圖片連結」。現在發文/編輯都可能收到「這個 session 剛上傳、還沒
// 綁進任何文章」的連結，同一套精神也要套用在這些連結上：postArticleFromForm/
// editArticleFromForm 只接受「這篇文章原本就有的連結」或「這個 session
// 透過 uploadImageBatch 剛上傳的連結」，其餘一律當成偽造，整個拒絕。
var PENDING_IMAGE_CACHE_PREFIX = 'pendingImg_';
var PENDING_IMAGE_TTL_SECONDS = 600; // 10 分鐘：只需要撐過「選圖→分批上傳→按下發表/儲存」這一次操作，不是長期保存。

function getPendingImageUrls_(cache, token) {
  var raw = cache.get(PENDING_IMAGE_CACHE_PREFIX + token);
  if (!raw) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function addPendingImageUrls_(cache, token, urls) {
  if (!urls || urls.length === 0) {
    return;
  }
  var merged = getPendingImageUrls_(cache, token).concat(urls);
  cache.put(PENDING_IMAGE_CACHE_PREFIX + token, JSON.stringify(merged), PENDING_IMAGE_TTL_SECONDS);
}

// 文章送出成功後清掉這個 session 的待用清單，避免被下一次不相關的發文/
// 編輯誤用；10 分鐘 TTL 本身也會自動過期，這裡只是讓「送出後馬上發下一篇」
// 的常見情境不用等 TTL。
function clearPendingImageUrls_(cache, token) {
  cache.remove(PENDING_IMAGE_CACHE_PREFIX + token);
}

/**
 * 圖片自動分批上傳：前端把「新選圖片」依位元組大小切成多個安全大小的批次
 * （見 Index.html 的 uploadImagesInBatches），依序呼叫這支函式，每次只
 * 挾帶一小批 base64 圖片，避免單次 google.script.run 呼叫的 payload 太大
 * 失敗（原本前端 30MB 總量檔就是為了擋這個，改成自動分批後不用使用者
 * 手動移除圖片重試）。
 *
 * 回傳的連結會先記進這個 session 的待用清單（見上方 addPendingImageUrls_），
 * postArticleFromForm/editArticleFromForm 最後寫入文章時會驗證使用者聲稱
 * 要用的連結是否真的來自這裡，避免繞過這支函式直接偽造任意字串。
 *
 * 只要求呼叫者是已登入的有效 session，沒有額外檢查 articlePost/
 * articleManageOwn 權限——跟原本 postArticleFromForm 裡「先上傳圖片、
 * 最後才在 createArticleForRole 檢查權限」是同一個既有行為，不是這裡
 * 新增的漏洞（這張圖最終能不能真的被用進一篇文章，還是看 createArticleForRole/
 * editArticleForRole 那一步）。
 * @param {string} token
 * @param {Array<{data:string, mimeType:string, fileName:string}>} images - 一個批次（不是全部）
 * @returns {{success:boolean, urls?:string[], error?:string}}
 */
function uploadImageBatch(token, images) {
  var cache = CacheService.getScriptCache();
  var userId = cache.get(SESSION_PREFIX + token);
  if (!userId) {
    return { success: false, error: '請重新登入' };
  }
  if (!images || images.length === 0) {
    return { success: true, urls: [] };
  }
  // 效率/資安複查時發現的問題（見對話紀錄）：原本這裡只檢查「這一批」
  // 有沒有超過上限，沒有累計這個 session 之前已經上傳過幾張——
  // uploadImageBatch 可以被呼叫任意次數（沒有次數上限），前端的
  // canAddImageToList_ 只擋得住「透過畫面正常操作累積出來的清單」，擋不住
  // 直接、重複呼叫這支函式（跳過前端 UI）。改成累計「這個 session 已經
  // 上傳、還沒用掉的張數」加上這一批，一起跟上限比較，超過就直接拒絕、
  // 不上傳——避免真正發文/編輯（postArticleFromForm/editArticleFromForm）
  // 那邊的總數檢查雖然最終還是會擋下、但已經浪費過的 Drive 上傳資源
  // （這個上限本身不影響單一使用者能發表的正常內容，一篇文章本來就不會
  // 真的需要遠超過 99 張圖片）。
  var existingPendingCount = getPendingImageUrls_(cache, token).length;
  if (existingPendingCount + images.length > MAX_IMAGES_PER_ARTICLE) {
    return { success: false, error: '圖片數量超過上限' };
  }
  var urls = uploadArticleImages_(images);
  addPendingImageUrls_(cache, token, urls);
  return { success: true, urls: urls };
}

/**
 * 把 JSON.stringify 的結果轉成可以安全印進 <script> 區塊的字串：手動轉掉
 * 尖括號跟 & 這三個 HTML/JS 都有特殊意義的字元（尤其是左尖括號可能組成
 * 提前關閉整個 script 區塊的序列）。
 *
 * 背景（實際部署後才發現的問題，見對話紀錄）：之前的版本改用「跳脫版」
 * 樣板插值印進 data-* 屬性，本意是為了閃過上面這個注入風險，但 GAS 樣板
 * 引擎的 contextual autoescaper 對自訂 data-* 屬性的情境判斷不可靠（會
 * 誤判成 URL 情境，把整個值換成內部的安全預設佔位字串——導致前端
 * JSON.parse 直接丟例外，初始化全部不會執行）。改回直接印成 <script>
 * 裡的變數宣告（不跳脫版插值），並且自己手動做跳脫，同時避開兩個問題。
 */
function toSafeScriptJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function doGet(e) {
  ensureSchema(getSpreadsheet_(), buildRoleValidationRule_);

  var bootstrapData = parseBootstrapParams(e);
  var template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapDataJson = toSafeScriptJson_(bootstrapData);
  template.scriptUrlJson = toSafeScriptJson_(ScriptApp.getService().getUrl()); // 真正對外的 /exec 網址

  return template.evaluate()
    .setTitle('BBS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Callable from the page via google.script.run to register a new user.
 * Generates salt/createdAt here (system clock + randomness are GAS-only
 * concerns) and wires the real Utilities/LockService into registerUser,
 * which itself stays pure and unit-testable.
 */
function registerUserFromForm(userId, password) {
  var salt = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var lock = LockService.getScriptLock();
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };

  return registerUser(getSpreadsheet_(), lock, digestFn, {
    userId: userId,
    password: password,
    salt: salt,
    createdAt: createdAt
  });
}

/**
 * Callable from the page via google.script.run to check the current
 * session's role. Always re-reads the Users sheet (see permissions.js),
 * so an admin's role change on the spreadsheet takes effect immediately.
 * Also returns userId so the frontend can decide, e.g., whether to show
 * an "edit" button on a given article (owner-only).
 *
 * 權限系統 ticket 10：permissions 現在是完整的 8 項權限物件（取代 04/05/07/08
 * 各自加的 4 個獨立命名旗標），因為含巢狀物件，這裡改回 JSON.stringify（見
 * 檔案開頭的慣例說明——這個函式本來是「扁平物件不用包」的範例，現在不再符合
 * 那個豁免資格了），前端對應要 JSON.parse。
 *
 * 效能優化 ticket 03：這是「查一次」快取的寫入時機——每次頁面載入/重新整理
 * 都會呼叫這裡（見 Index.html 的 checkUserStatus），角色/權限/可瀏覽看板清單
 * 在這裡即時查好之後，順便存進一份獨立於 SESSION_PREFIX 的快取（見
 * login.js 的 putSessionSnapshot），後續同一次頁面載入內的讀取類端點
 * （getBoardsFromToken/getArticleDetailFromToken）改吃這份快取，不再各自
 * 重新即時查表。寫入類端點完全不受影響，繼續呼叫 getSessionRole/
 * getRolePermissions 即時查驗，不讀這份快取。
 */
function getMyStatus(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var userId = cache.get(SESSION_PREFIX + token);
  var snapshot = buildRoleSnapshot(ss, role);
  if (userId) {
    putSessionSnapshot(cache, token, snapshot);
  }
  return JSON.stringify({
    role: role,
    userId: userId,
    permissions: snapshot.permissions
  });
}

/**
 * Callable from the page via google.script.run. Filters the live board
 * list against the cached session snapshot's allowedBoardIds (perf-
 * optimization ticket 03) instead of re-deriving the role's allowed
 * boards from a live Permission+Boards read on every call — getMyStatus
 * (above) is what keeps that snapshot fresh, once per page load.
 *
 * 看板列表新內容提示功能：角色通過權限檢查時，額外算出每個看板的
 * hasNewArticle/hasNewReply，合併進回傳的看板物件。只回傳布林值給前端，
 * 不外流看板/使用者的原始時間戳記字串。這部分維持即時讀取 Boards/Users，
 * 不受這次快取影響——新內容提示本來就是看當下的資料，不是權限判斷。
 */
function getBoardsFromToken(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var snapshot = getSessionSnapshot(cache, token);
  var boards = listBoards(ss).filter(function (b) {
    return snapshotAllowsBoardArticleRead(snapshot, b.boardId);
  });

  if (boards.length === 0) {
    return JSON.stringify(boards); // 沒有快取(未登入/過期)或無權限：boards 已經是空陣列，不用算提示
  }

  var userId = cache.get(SESSION_PREFIX + token);
  var userRecord = userId ? getUserRecord_(ss.getSheetByName('Users'), userId) : null;
  var lastSeenBoards = getLastSeenBoards(userRecord ? userRecord.lastSeenBoards : '');
  var status = getBoardNewContentStatus(lastSeenBoards, boards);

  var boardsWithStatus = boards.map(function (b) {
    return {
      boardId: b.boardId,
      boardName: b.boardName,
      description: b.description,
      sortOrder: b.sortOrder,
      hasNewArticle: status[b.boardId].hasNewArticle,
      hasNewReply: status[b.boardId].hasNewReply
    };
  });
  return JSON.stringify(boardsWithStatus);
}

/**
 * Callable from the page via google.script.run whenever the user enters a
 * board (selects it from the dropdown or the board-list popup). Per the
 * confirmed design: entering a board marks everything before "now" as seen,
 * regardless of whether the user actually opens any article. 刻意不上鎖，
 * 理由同 loginCount：純顯示用途，允許極端併發下的些微誤差。
 */
function markBoardSeenFromToken(token, boardId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var userId = cache.get(SESSION_PREFIX + token);
  if (!userId) {
    return; // session 已過期/無效，安靜跳過，不讓這個背景動作干擾其他操作
  }

  var usersSheet = ss.getSheetByName('Users');
  var userRecord = getUserRecord_(usersSheet, userId);
  if (!userRecord) {
    return;
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var updated = updateLastSeenBoard(userRecord.lastSeenBoards, boardId, now);
  usersSheet.getRange(userRecord.row_, 10, 1, 1).setValue(updated);
}

/**
 * Callable from the page via google.script.run. Perf-optimization
 * ticket 05: this is now the frontend's sole board-entry call.
 *
 * 安全性審查 L1 修復：這裡原本還留著舊版的 getArticlesFromToken
 * （優化輪 ticket 03 用的、單頁全撈版本），註解當時已經寫明前端不再
 * 呼叫它，純粹是清理沒排進那一輪 ticket 範圍——確認過 Index.html/
 * lineBotGlue.js 都沒有任何地方呼叫它之後，這裡直接刪掉，不留一個沒人
 * 用、卻仍然是任何人都能呼叫的 google.script.run 端點。它包過的
 * getArticlesForRole/listArticlesByBoard 兩支函式本身沒有動，仍然有
 * 自己的測試覆蓋，只是不再有 Code.js 的入口指向它們（articles.js 目前
 * 也確實沒有其他呼叫端）。
 *
 * Returns one page of the board's articles WITH
 * full content/images, plus every one of those articles' replies
 * (boardBulk.js's getBoardBulkPage — one Articles read, one Replies
 * read, regardless of page size).
 *
 * Gate comes entirely from the session snapshot (ticket 03) — no live
 * Permission/Boards read here. Version key is boardId + ':page' +
 * pageIndex, reusing getBoardVersion/bumpBoardVersion from
 * contentVersion.js completely unmodified: those two functions are
 * generic string-keyed cache wrappers, so a composite key works with
 * zero changes to that file. Each page's version is independent — an
 * edit to an old article on page 2 doesn't invalidate page 1's cached
 * version, and vice versa.
 */
function getBoardBulkFromToken(token, boardId, pageIndex, clientVersion) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var snapshot = getSessionSnapshot(cache, token);
  var allowed = snapshotAllowsBoardArticleRead(snapshot, boardId);
  var versionKey = boardId + ':page' + pageIndex;
  var currentVersion = getBoardVersion(cache, versionKey);

  if (!allowed) {
    return JSON.stringify({ unchanged: false, version: null, articles: [], repliesByArticleId: {}, hasMore: false });
  }

  if (clientVersion && currentVersion && clientVersion === currentVersion) {
    return JSON.stringify({ unchanged: true, version: currentVersion });
  }

  var page = getBoardBulkPage(ss, boardId, pageIndex, BOARD_BULK_PAGE_SIZE);
  var version = Utilities.getUuid();
  bumpBoardVersion(cache, versionKey, version);
  return JSON.stringify({
    unchanged: false,
    version: version,
    articles: page.articles,
    repliesByArticleId: page.repliesByArticleId,
    hasMore: page.hasMore,
    // 跳頁功能用（見 Index.html 的 pager bar）：unchanged 分支跟 !allowed 分支
    // 沒有真的呼叫 getBoardBulkPage，故意不帶這兩個欄位——前端遇到沒有這兩個
    // 欄位的回應時，沿用本地既有的 totalCount/pageSize，不會被 undefined 蓋掉。
    totalCount: page.totalCount,
    pageSize: page.pageSize
  });
}

/**
 * Callable from the page via google.script.run. A disallowed role and a
 * deleted/missing article both come back as {article: null, replies: []}
 * (see getArticleDetailForSnapshot's own doc comment for why that's
 * deliberate).
 *
 * 優化輪 ticket 04（#1b）：clientVersion 行為對稱於 getArticlesFromToken 的
 * 看板版本比對（見 ticket 03 的註解），只是這裡比對的是文章版本。
 *
 * 效能優化 ticket 03：allowed 現在讀 getMyStatus 快取寫入的 session 快照
 * （只查全域 articleRead，不查看板層級的 AllowRoles——理由跟原本一樣：
 * 查看板需要先知道 boardId，而唯一能知道 boardId 的方法是把文章整列讀出
 * 來，那正好是版本戳快取想避免的讀取動作），不再即時查 Permission 表。
 * 真正精確的 AllowRoles 檢查在 getArticleDetailForSnapshot 裡（版本不符、
 * 或本來就沒有快取版本、真的要重讀文章時才會發生），現在也一樣改吃快照裡
 * 的 allowedBoardIds，不再即時查 Boards 表——找到文章的 boardId 後只是查
 * 陣列成員，不是查表。取捨過的已知限制不變：管理者剛把某個看板的
 * AllowRoles 改成排除某角色、或剛把某人的角色整個改掉，若這個角色瀏覽器
 * 裡剛好對這篇文章有命中的快取版本，要等版本被其他異動打掉（文章被編輯/
 * 刪除）或重新整理頁面（見 getMyStatus，那裡才會重新查快照），才會真的被
 * 擋下——已確認這個代價可以接受（權限調整頻率極低）。
 */
function getArticleDetailFromToken(token, articleId, clientVersion) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var snapshot = getSessionSnapshot(cache, token);
  var currentVersion = getArticleVersion(cache, articleId);
  var allowed = !!(snapshot && snapshot.permissions && snapshot.permissions.articleRead);

  if (allowed && clientVersion && currentVersion && clientVersion === currentVersion) {
    return JSON.stringify({ unchanged: true, version: currentVersion });
  }

  var detail = getArticleDetailForSnapshot(ss, snapshot, articleId);
  var version = currentVersion;
  if (allowed && !version && detail.article) {
    version = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, version);
  }
  return JSON.stringify({ unchanged: false, version: version, article: detail.article, replies: detail.replies });
}

/**
 * Callable from the page via google.script.run to delete a reply.
 * 權限系統 ticket 07 之後，非 admin 角色只要有 replyDeleteOwn 權限、且是
 * 自己發的回覆，也能刪除——不再是 admin 專屬（deleteReplyForRole 內部依
 * role 分流，admin 略過 AllowRoles 與本人檢查，非 admin 兩者都要通過）。
 */
function deleteReplyFromForm(token, articleId, replyId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var requestingUserId = cache.get(SESSION_PREFIX + token); // 權限系統 ticket 07：非 admin 現在也可能需要通過本人檢查
  var lock = LockService.getScriptLock();

  var result = deleteReplyForRole(ss, lock, role, requestingUserId, articleId, replyId);

  if (result.success) {
    var newVersion = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, newVersion);
    result.version = newVersion;

    // 效能優化 ticket 05：回覆屬於某篇文章、文章屬於某個看板，該看板批量預載
    // 快取裡的 repliesByArticleId 也要跟著失效，否則其他還握著舊版本值的使用者，
    // 離開再切回這個看板時，版本比對會誤判成「沒有異動」，看不到這則回覆已經
    // 被刪除。跳頁功能上線後，改用 findArticlePageIndex 找出這篇文章目前真正在
    // 哪一頁，bump 那一頁的版本 key——不能再寫死 :page0，否則使用者如果是在很舊
    // 的頁次點開文章回覆，這裡 bump 錯頁，其他人看那一頁永遠不會發現有異動。
    var repliedArticle = getArticleById(ss, articleId);
    if (repliedArticle) {
      var repliedPageIndex = findArticlePageIndex(ss, repliedArticle.boardId, articleId, BOARD_BULK_PAGE_SIZE);
      if (repliedPageIndex !== null) {
        bumpBoardVersion(cache, repliedArticle.boardId + ':page' + repliedPageIndex, Utilities.getUuid());
      }
    }
  }
  return result;
}

/**
 * Callable from the page via google.script.run to delete your own
 * article (cascades to its replies). requestingUserId comes from the
 * session, same pattern as edit/post. When role is admin,
 * deleteArticleForRole internally bypasses the ownership check.
 */
function deleteArticleFromForm(token, articleId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var requestingUserId = cache.get(SESSION_PREFIX + token);
  var lock = LockService.getScriptLock();
  var existingArticle = getArticleById(ss, articleId); // 刪除前先查，刪掉之後這一列就不在了，查不到 boardId 了
  // 跳頁功能：頁次也要在刪除前查——刪掉之後這篇文章從排序中消失，
  // findArticlePageIndex 會回傳 null，就找不到它「本來」在哪一頁了
  var existingPageIndex = existingArticle ? findArticlePageIndex(ss, existingArticle.boardId, articleId, BOARD_BULK_PAGE_SIZE) : null;

  var result = deleteArticleForRole(ss, lock, role, requestingUserId, articleId, createDriveInterface_());

  if (result.success && existingArticle) {
    var newVersion = Utilities.getUuid();
    bumpBoardVersion(cache, existingArticle.boardId, newVersion);
    result.version = newVersion;
    result.boardId = existingArticle.boardId; // 前端要知道刪的是哪個看板的快取

    // 優化輪 ticket 04：文章版本也要 bump，否則另一個手上還存著舊版本值的使用者
    // （例如透過分享連結打開同一篇已被刪除的文章）比對版本時會誤判成「沒有異動」，
    // 繼續顯示這篇其實已經不存在的文章內容
    bumpArticleVersion(cache, articleId, Utilities.getUuid());

    // 效能優化 ticket 05：同上，看板批量預載快取也要失效，見 deleteReplyFromForm
    // 的註解說明。用刪除前查到的 existingPageIndex，不是寫死 :page0——已知的簡化：
    // 刪除會讓「這一頁之後（更舊）」的所有頁次邊界跟著往前收斂一格，這裡只
    // bump 被刪文章本來所在的那一頁，沒有連帶 bump 更舊的頁次；真的同時有人在
    // 瀏覽某個更舊頁次、又剛好被這次刪除影響到邊界的機率很低，屬於已知、可接受
    // 的邊界情況（頂多看到頁碼邊界有一格誤差，不會顯示錯誤或不存在的內容）。
    if (existingPageIndex !== null) {
      bumpBoardVersion(cache, existingArticle.boardId + ':page' + existingPageIndex, Utilities.getUuid());
    }
  }
  return result;
}

/**
 * 圖片張數突破：把前端送來的「圖片格」清單（原本固定 3 格，現在是任意長度
 * 的動態清單，最多 MAX_IMAGES_PER_ARTICLE 張）解析成最終要寫進 Articles 的
 * imageUrls JSON 陣列。每一格是：
 *   - 字串：既有連結要保留，或空字串代表這一格是空的/被移除
 *   - {data, mimeType, fileName}：新選的圖片，要先上傳到 Drive 才知道連結
 * imageSlots 整個省略（undefined）代表這次編輯不碰圖片，回傳
 * { imageUrls: undefined, error: null } 讓 editArticleForRole 保留原樣。
 *
 * 安全性審查 H3 修復：驗證邏輯（字串格必須真的等於 existingImageUrls
 * 之一，見審查報告 H3）已經拆到 imageStorage.js 的純函式
 * resolveImageSlots——本函式只是那支純函式加上「真的呼叫 Drive
 * 上傳新圖片」這一步 GAS 專屬的部分，兩者合起來才是原本這整支函式
 * 做的事，讀取次數/行為完全不變，只是拆檔。existingImageUrls 沿用
 * 呼叫端在 editArticleFromForm 裡用 getArticleById 已經查過的結果，
 * 這裡不會、也不需要再多讀一次 Articles。
 * @param {Array} imageSlots
 * @param {Array<string>} existingImageUrls - 這篇文章目前的 imageUrls 陣列，
 *   找不到文章時傳 []。
 * @returns {{imageUrls: (Array|undefined|null), error: (string|null)}}
 */
function resolveImageSlots_(imageSlots, existingImageUrls) {
  var step = resolveImageSlots(imageSlots, existingImageUrls);
  if (step.error) {
    return { imageUrls: null, error: step.error };
  }
  if (!step.resolved) {
    return { imageUrls: undefined, error: null };
  }
  var resolved = step.resolved;
  if (step.newImages.length > 0) {
    var uploadedUrls = uploadArticleImages_(step.newImages);
    for (var j = 0; j < step.newImageSlotIndexes.length; j++) {
      resolved[step.newImageSlotIndexes[j]] = uploadedUrls[j] || '';
    }
  }
  // resolved 可能還留著空位（被移除的格子、或極端情況下上傳失敗的新圖），
  // 壓成不留空缺的乾淨陣列再往下傳——editArticle.js 本身寫入前也會
  // compactImageUrlsFor_ 一次，這裡先壓一次是為了 result.imageUrls 這個
  // 回傳給前端本地 patch 文章詳情用的欄位，不要帶著空字串洞回去。
  return { imageUrls: compactImageUrls(resolved), error: null };
}

/**
 * Callable from the page via google.script.run to edit an article.
 * requestingUserId comes from the session, same as postArticleFromForm's
 * author — the client can't claim to be someone else. editedAt is
 * generated here for the same reason as elsewhere. When role is admin,
 * editArticleForRole internally bypasses the ownership check (editedBy
 * still records the admin, not the original author).
 *
 * 優化輪 ticket 10：imageSlots 見 resolveImageSlots_ 的說明；省略代表不動圖片。
 */
function editArticleFromForm(token, articleId, title, content, imageSlots) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var requestingUserId = cache.get(SESSION_PREFIX + token);
  var editedAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var existingArticle = getArticleById(ss, articleId); // 先查出 boardId，等下成功才知道要 bump 哪個看板的版本
  // 跳頁功能：編輯不會改變 createdAt，文章排序位置不變，這裡先查跟編輯後再查
  // 結果一樣，習慣上還是跟 existingArticle 一起在異動前查好
  var existingPageIndex = existingArticle ? findArticlePageIndex(ss, existingArticle.boardId, articleId, BOARD_BULK_PAGE_SIZE) : null;
  // 安全性審查 H3 修復：existingArticle 這次查詢本來就會帶回 imageUrls
  // （見 articleDetail.js 的 getArticleById），直接沿用，不多讀一次
  // Articles，交給 resolveImageSlots_ 驗證客戶端聲稱要保留的字串是否
  // 真的是這篇文章既有的連結之一。
  var existingImageUrls = existingArticle ? existingArticle.imageUrls : [];
  // 圖片自動分批上傳：imageSlots 裡「新選圖片」現在也已經是 uploadImageBatch
  // 上傳完成的連結字串（不再是 base64 物件），跟「保留既有連結」的字串一樣
  // 都要通過 resolveImageSlots 的字串比對驗證——把這個 session 剛上傳、
  // 還沒用掉的連結（見 getPendingImageUrls_）併進「合法字串」的集合，
  // resolveImageSlots 本身完全不用改，兩種合法來源一起檢查（見
  // uploadImageBatch 開頭那段對 H3 修復的說明）。
  var pendingImageUrls = getPendingImageUrls_(cache, token);
  var resolvedSlots = resolveImageSlots_(imageSlots, existingImageUrls.concat(pendingImageUrls));
  if (resolvedSlots.error) {
    return { success: false, error: resolvedSlots.error };
  }

  var result = editArticleForRole(ss, role, requestingUserId, articleId, {
    title: title,
    content: content,
    editedAt: editedAt,
    imageUrls: resolvedSlots.imageUrls
  }, createDriveInterface_());

  if (result.success && existingArticle) {
    var newVersion = Utilities.getUuid();
    bumpBoardVersion(cache, existingArticle.boardId, newVersion);
    result.version = newVersion;
    result.boardId = existingArticle.boardId; // 前端要知道改的是哪個看板的快取

    // 優化輪 ticket 04：編輯內容也會反映在文章詳情頁，文章版本要一起 bump，
    // 並把 editedAt/editedBy 一併回傳，前端才能本地直接更新文章詳情快取，不用整篇重讀
    var newArticleVersion = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, newArticleVersion);
    result.articleVersion = newArticleVersion;
    result.editedAt = editedAt;
    result.editedBy = requestingUserId;
    if (resolvedSlots.imageUrls) {
      result.imageUrls = resolvedSlots.imageUrls; // 優化輪 ticket 10：前端本地 patch 文章詳情的圖片用
    }

    // 看板新內容提示功能：編輯文章也算「這個看板有新動態」（使用者確認過的決策）
    bumpBoardActivity_(ss.getSheetByName('Boards'), existingArticle.boardId, BOARD_LATEST_ARTICLE_AT_COLUMN, editedAt);

    // 效能優化 ticket 05：看板批量預載快取也要失效，見 deleteReplyFromForm 的
    // 註解說明。用編輯前查到的 existingPageIndex，不是寫死 :page0
    if (existingPageIndex !== null) {
      bumpBoardVersion(cache, existingArticle.boardId + ':page' + existingPageIndex, Utilities.getUuid());
    }
    // 圖片自動分批上傳：這次編輯用掉的（或沒用到的）待用連結都已經有結果了，
    // 清掉這個 session 的待用清單，避免被下一次不相關的發文/編輯誤用。
    clearPendingImageUrls_(cache, token);
  }
  return result;
}

/**
 * Callable from the page via google.script.run to post a new article.
 * SECURITY NOTE: author is looked up from the session token via the
 * cache, never accepted as a parameter from the client — this is the
 * actual place "the frontend can't spoof who posted this" is enforced.
 * articleId/createdAt are generated here for the same reason ticket 01's
 * pingRoundTrip and ticket 02's registerUser take them as input: the
 * core logic in postArticle.js stays free of system-clock/randomness
 * calls and is unit-testable.
 */
function postArticleFromForm(token, boardId, title, content, imageUrls) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var author = cache.get(SESSION_PREFIX + token); // the verified userId, not a form field
  var lock = LockService.getScriptLock();
  var articleId = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  imageUrls = imageUrls || [];
  // 圖片張數突破：檢查張數，超過上限直接拒絕，讓使用者自行調整——createArticle
  // 內部也會再檢查一次（縱深防禦，不依賴這裡是唯一關卡）。
  var imageCountCheck = validateImageCount(imageUrls.length);
  if (!imageCountCheck.valid) {
    return { success: false, error: imageCountCheck.error };
  }
  // 圖片自動分批上傳：這裡收到的都已經是 uploadImageBatch 上傳完成後的
  // Drive 連結字串（不再是 base64，不用在這裡才呼叫 uploadArticleImages_），
  // 驗證每個連結都真的是這個 session 剛上傳、還沒用掉的（見
  // getPendingImageUrls_），不接受客戶端聲稱的任意字串——「發文」原本沒有
  // 字串路徑，改成分批上傳後也需要跟編輯文章一樣的 H3 式防護，見
  // uploadImageBatch 開頭那段說明。
  var pendingImageUrls = getPendingImageUrls_(cache, token);
  for (var i = 0; i < imageUrls.length; i++) {
    if (pendingImageUrls.indexOf(imageUrls[i]) === -1) {
      return { success: false, error: '圖片資料異常，請重新選擇圖片再試一次' };
    }
  }

  var result = createArticleForRole(ss, lock, role, {
    articleId: articleId,
    boardId: boardId,
    title: title,
    content: content,
    author: author,
    createdAt: createdAt,
    imageUrls: imageUrls
  });

  if (result.success) {
    var newVersion = Utilities.getUuid();
    bumpBoardVersion(cache, boardId, newVersion);
    result.version = newVersion; // 讓前端把本地快取的版本值同步更新，下次比對才不會誤判成「有其他異動」
    // 優化輪 ticket 03：前端已知 title/boardId，但 articleId/author/createdAt 是這裡才生成/驗證出來的，
    // 一併回傳讓前端可以直接把新文章拼進本地快取，不用整表重新讀取
    result.articleId = articleId;
    result.author = author;
    result.createdAt = createdAt;
    // 實際部署後發現的問題（見對話紀錄）：上面這段只回傳了 articleId/author/
    // createdAt，前端本地拼裝的文章物件因此漏了 content 跟 imageUrls 兩個
    // 欄位——點開這篇剛發表的文章時，detail 畫面其實是直接信任本地文章列表
    // 快取（loadArticleDetail 找得到就不重新呼叫伺服器，見該函式說明），
    // 缺欄位就會顯示成「只有標題、內容跟圖片都是空的」，重新整個進板才會
    // 因為走一次真正的整批讀取而補回正確資料。content 前端本來就有（表單
    // 打的內容），imageUrls 只有伺服器這裡知道（圖片上傳到 Drive 後才拿得
    // 到最終連結），所以要多回傳這一個欄位。
    result.imageUrls = imageUrls;

    // 看板新內容提示功能：新發表文章更新看板的 latestArticleAt
    bumpBoardActivity_(ss.getSheetByName('Boards'), boardId, BOARD_LATEST_ARTICLE_AT_COLUMN, createdAt);

    // 效能優化 ticket 05：看板批量預載快取也要失效，新文章才會出現在其他人下次
    // 進板拿到的整批資料裡，見 deleteReplyFromForm 的註解說明。這裡維持寫死
    // :page0 不變——新文章一律 createdAt 最新，排序後永遠落在第 0 頁，不像
    // 編輯/刪除/回覆需要用 findArticlePageIndex 現查（跳頁功能上線後也一樣）
    bumpBoardVersion(cache, boardId + ':page0', Utilities.getUuid());
    // 圖片自動分批上傳：這次發文用掉的（或沒用到的）待用連結都已經有結果了，
    // 清掉這個 session 的待用清單，避免被下一次不相關的發文/編輯誤用。
    clearPendingImageUrls_(cache, token);
  }
  return result;
}

/**
 * Callable from the page via google.script.run to post a reply.
 * Same author-from-session-token pattern as postArticleFromForm — the
 * client never gets to say who it's posting as.
 */
function postReplyFromForm(token, articleId, content) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var author = cache.get(SESSION_PREFIX + token);
  var lock = LockService.getScriptLock();
  var replyId = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  var result = createReplyForRole(ss, lock, role, {
    replyId: replyId,
    articleId: articleId,
    author: author,
    content: content,
    createdAt: createdAt
  });

  if (result.success) {
    var newVersion = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, newVersion);
    result.version = newVersion;
    // 優化輪 ticket 04：前端已知 content，但 replyId/author/createdAt 是這裡才生成/驗證出來的，
    // 一併回傳讓前端可以直接把新回覆拼進本地快取，不用重新讀取整篇文章詳情
    result.replyId = replyId;
    result.author = author;
    result.createdAt = createdAt;

    // 看板新內容提示功能：回覆沒有直接帶 boardId，要先查出這篇文章屬於哪個看板，
    // 才知道要更新哪個看板的 latestReplyAt
    var repliedArticle = getArticleById(ss, articleId);
    if (repliedArticle) {
      bumpBoardActivity_(ss.getSheetByName('Boards'), repliedArticle.boardId, BOARD_LATEST_REPLY_AT_COLUMN, createdAt);
      // 效能優化 ticket 05：看板批量預載快取也要失效，見 deleteReplyFromForm 的
      // 註解說明。用 findArticlePageIndex 找出這篇文章目前真正在哪一頁，不是
      // 寫死 :page0
      var repliedPageIndex = findArticlePageIndex(ss, repliedArticle.boardId, articleId, BOARD_BULK_PAGE_SIZE);
      if (repliedPageIndex !== null) {
        bumpBoardVersion(cache, repliedArticle.boardId + ':page' + repliedPageIndex, Utilities.getUuid());
      }
    }
  }
  return result;
}

/**
 * Callable from the page via google.script.run to log a user in.
 */
function loginFromForm(userId, password) {
  var cache = CacheService.getScriptCache();
  var digestFn = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  };
  var tokenGenerator = function () {
    return Utilities.getUuid();
  };
  var nowTimestamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

  return login(getSpreadsheet_(), cache, tokenGenerator, digestFn, nowTimestamp, {
    userId: userId,
    password: password
  });
}

/**
 * Callable from the page via google.script.run to log the current
 * session out. Removes the token from CacheService so it can no longer
 * be used to authenticate any request, even if the client still has it
 * cached somewhere. Also clears the session snapshot (效能優化 ticket 03)
 * under its own key — a stale snapshot lingering past logout would be
 * harmless (SESSION_PREFIX's removal already blocks every write path,
 * and getBoardsFromToken/getArticleDetailFromToken with no valid
 * SESSION_PREFIX entry never get called with a live token again from
 * the frontend after logout), but there's no reason to leave it sitting
 * in the cache until its own TTL expires.
 */
function logoutFromForm(token) {
  var cache = CacheService.getScriptCache();
  cache.remove(SESSION_PREFIX + token);
  removeSessionSnapshot(cache, token);
}

/**
 * Callable from the page via google.script.run to manually verify the
 * write -> read path against the real spreadsheet (ticket 01's
 * "walking skeleton" proof).
 */
function runPingCheck() {
  var value = 'ping-' + new Date().getTime();
  return pingRoundTrip(getSpreadsheet_(), value);
}

/**
 * 優化輪 ticket 08（#5）：排行榜權限查詢見 leaderboard.js 的 getLeaderboardForRole
 * （角色即時查詢、不快取）。不做版本快取——見 leaderboard.js 開頭註解，讀取
 * 來源已經是一張很小的表，沒有另外快取的必要。
 */
function getLeaderboardFromToken(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);

  return JSON.stringify(getLeaderboardForRole(ss, role));
}