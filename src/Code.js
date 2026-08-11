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
 * 把前端送來的圖片（最多 3 張，{data(base64), mimeType, fileName}）逐一存進
 * Drive，回傳對應的可檢視連結陣列。images 為空/未提供時回傳空陣列。
 */
function uploadArticleImages_(images) {
  if (!images || images.length === 0) {
    return [];
  }
  var drive = createDriveInterface_();
  var properties = createPropertiesInterface_();
  var yyyyMM = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  var urls = [];
  for (var i = 0; i < Math.min(images.length, 3); i++) {
    var img = images[i];
    var saved = saveArticleImage(drive, properties, img.data, img.mimeType, img.fileName, yyyyMM);
    urls.push(saved.url);
  }
  return urls;
}

function doGet(e) {
  ensureSchema(getSpreadsheet_());

  var bootstrapData = parseBootstrapParams(e);
  var template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapDataJson = JSON.stringify(bootstrapData);
  template.scriptUrlJson = JSON.stringify(ScriptApp.getService().getUrl()); // 新增：真正對外的 /exec 網址

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
 */
function getMyStatus(token) {
  var cache = CacheService.getScriptCache();
  var role = getSessionRole(cache, getSpreadsheet_(), token);
  var userId = cache.get(SESSION_PREFIX + token);
  return { role: role, userId: userId };
}

/**
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh (see permissions.js) and returns the board list
 * only if that role passes the gate; empty array otherwise.
 *
 * 看板列表新內容提示功能：角色通過權限檢查時，額外算出每個看板的
 * hasNewArticle/hasNewReply，合併進回傳的看板物件。只回傳布林值給前端，
 * 不外流看板/使用者的原始時間戳記字串。
 */
function getBoardsFromToken(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var boards = getBoardsForRole(ss, role);

  if (!gateByRole(role, ['user', 'admin'])) {
    return JSON.stringify(boards); // newbie/無權限：boards 已經是空陣列，不用算提示
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
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh and returns the article list for boardId only if
 * that role passes the gate; empty array otherwise.
 *
 * 優化輪 ticket 03（#1a）：clientVersion 是前端這次 session 裡，上次讀取這個
 * 看板時拿到的版本值（第一次讀取該看板時沒有，傳空字串/undefined 即可）。跟
 * 目前的看板版本相符時，直接回傳 {unchanged:true}，不做 listArticlesByBoard
 * 整表掃描/排序/序列化；版本不明（cache 從沒寫過或已過期）時，順便建立一個
 * 新的版本基準，讓「之後沒人異動」的情況下，下一次讀取可以吃到版本比對的效能
 * 優勢——但這個動作本身不算「異動」，不影響其他人手上的版本值是否還有效。
 */
function getArticlesFromToken(token, boardId, clientVersion) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var currentVersion = getBoardVersion(cache, boardId);

  // 角色檢查一定要每次都做（見 permissions.js 的設計：角色即時查詢、不快取），
  // 版本比對只在角色通過時才拿來當作「可以跳過整表掃描」的依據，避免角色被
  // 降級的使用者靠著版本比對命中，繼續看到降級前快取住的舊資料。
  var allowed = gateByRole(role, ['user', 'admin']);

  if (allowed && clientVersion && currentVersion && clientVersion === currentVersion) {
    return JSON.stringify({ unchanged: true, version: currentVersion });
  }

  var articles = getArticlesForRole(ss, role, boardId);
  var version = currentVersion;
  if (allowed && !version) {
    version = Utilities.getUuid();
    bumpBoardVersion(cache, boardId, version);
  }
  return JSON.stringify({ unchanged: false, version: version, articles: articles });
}

/**
 * Callable from the page via google.script.run. Looks up the caller's
 * current role fresh; a disallowed role and a deleted/missing article
 * both come back as {article: null, replies: []} (see
 * getArticleDetailForRole's own doc comment for why that's deliberate).
 *
 * 優化輪 ticket 04（#1b）：clientVersion 行為對稱於 getArticlesFromToken 的
 * 看板版本比對（見 ticket 03 的註解），只是這裡比對的是文章版本。
 */
function getArticleDetailFromToken(token, articleId, clientVersion) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var currentVersion = getArticleVersion(cache, articleId);
  var allowed = gateByRole(role, ['user', 'admin']);

  if (allowed && clientVersion && currentVersion && clientVersion === currentVersion) {
    return JSON.stringify({ unchanged: true, version: currentVersion });
  }

  var detail = getArticleDetailForRole(ss, role, articleId);
  var version = currentVersion;
  if (allowed && !version && detail.article) {
    version = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, version);
  }
  return JSON.stringify({ unchanged: false, version: version, article: detail.article, replies: detail.replies });
}

/**
 * Callable from the page via google.script.run to delete a reply.
 * Admin-only (see deleteReplyForRole's ['admin']-only allow list) — no
 * ownership check, since per spec even the reply's own author can never
 * delete it themselves.
 */
function deleteReplyFromForm(token, articleId, replyId) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var lock = LockService.getScriptLock();

  var result = deleteReplyForRole(ss, lock, role, articleId, replyId);

  if (result.success) {
    var newVersion = Utilities.getUuid();
    bumpArticleVersion(cache, articleId, newVersion);
    result.version = newVersion;
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
  }
  return result;
}

/**
 * 優化輪 ticket 10：把前端送來的 3 個「圖片格」解析成最終要寫進 Articles 的
 * imageUrl1~3。每一格是：
 *   - 字串：既有連結要保留，或空字串代表這一格是空的/被移除
 *   - {data, mimeType, fileName}：新選的圖片，要先上傳到 Drive 才知道連結
 * imageSlots 整個省略（undefined）代表這次編輯不碰圖片，回傳 undefined 讓
 * editArticleForRole 保留原樣。
 */
function resolveImageSlots_(imageSlots) {
  if (!imageSlots) {
    return undefined;
  }
  var resolved = ['', '', ''];
  var newImages = [];
  var newImageSlotIndexes = [];
  for (var i = 0; i < 3; i++) {
    var slot = imageSlots[i];
    if (slot && typeof slot === 'object' && slot.data) {
      newImages.push(slot);
      newImageSlotIndexes.push(i);
    } else if (typeof slot === 'string') {
      resolved[i] = slot;
    }
  }
  if (newImages.length > 0) {
    var uploadedUrls = uploadArticleImages_(newImages);
    for (var j = 0; j < newImageSlotIndexes.length; j++) {
      resolved[newImageSlotIndexes[j]] = uploadedUrls[j] || '';
    }
  }
  return resolved;
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
  var resolvedImageUrls = resolveImageSlots_(imageSlots);

  var result = editArticleForRole(ss, role, requestingUserId, articleId, {
    title: title,
    content: content,
    editedAt: editedAt,
    imageUrls: resolvedImageUrls
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
    if (resolvedImageUrls) {
      result.imageUrls = resolvedImageUrls; // 優化輪 ticket 10：前端本地 patch 文章詳情的圖片用
    }

    // 看板新內容提示功能：編輯文章也算「這個看板有新動態」（使用者確認過的決策）
    bumpBoardActivity_(ss.getSheetByName('Boards'), existingArticle.boardId, BOARD_LATEST_ARTICLE_AT_COLUMN, editedAt);
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
function postArticleFromForm(token, boardId, title, content, images) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);
  var author = cache.get(SESSION_PREFIX + token); // the verified userId, not a form field
  var lock = LockService.getScriptLock();
  var articleId = Utilities.getUuid();
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var imageUrls = uploadArticleImages_(images); // 優化輪 ticket 09：先上傳圖片拿到連結，再寫文章列

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

    // 看板新內容提示功能：新發表文章更新看板的 latestArticleAt
    bumpBoardActivity_(ss.getSheetByName('Boards'), boardId, BOARD_LATEST_ARTICLE_AT_COLUMN, createdAt);
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
 * cached somewhere.
 */
function logoutFromForm(token) {
  var cache = CacheService.getScriptCache();
  cache.remove(SESSION_PREFIX + token);
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
 * 優化輪 ticket 08（#5）：排行榜只對 user/admin 開放，跟看板文章列表一樣的
 * 角色檢查（角色即時查詢、不快取）。不做版本快取——見 leaderboard.js 開頭
 * 註解，讀取來源已經是一張很小的表，沒有另外快取的必要。
 */
function getLeaderboardFromToken(token) {
  var cache = CacheService.getScriptCache();
  var ss = getSpreadsheet_();
  var role = getSessionRole(cache, ss, token);

  if (!gateByRole(role, ['user', 'admin'])) {
    return JSON.stringify({ loginCount: [], articleCount: [], replyCount: [] });
  }

  return JSON.stringify(getLeaderboard(ss.getSheetByName('Users')));
}