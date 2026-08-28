/**
 * LINE webhook 相關的膠水邏輯（doPost 進入點），獨立於既有 Code.js 的
 * doGet 膠水之外——兩者是完全不同的進入點，各自維護。
 *
 * 這個檔案本身走 glue 層，不直接單元測試；正確性由它組合的純函式
 * （resolveGroupBoard / classifyLineMessage / hasProcessedEvent）各自的
 * 測試，以及部署後的人工驗證涵蓋。
 */
var _lineGroupBoardModule = (typeof require !== 'undefined') ? require('./lineGroupBoard') : null;
var _lineMessageClassifyModule = (typeof require !== 'undefined') ? require('./lineMessageClassify') : null;
var _lineStagingModule = (typeof require !== 'undefined') ? require('./lineStaging') : null;
var _imageStorageModule = (typeof require !== 'undefined') ? require('./imageStorage') : null;
var _lineDigestThresholdModule = (typeof require !== 'undefined') ? require('./lineDigestThreshold') : null;
var _lineArticleTitleModule = (typeof require !== 'undefined') ? require('./lineArticleTitle') : null;
var _lineArticleContentModule = (typeof require !== 'undefined') ? require('./lineArticleContent') : null;
var _postArticleModule = (typeof require !== 'undefined') ? require('./postArticle') : null;
var _contentVersionModule = (typeof require !== 'undefined') ? require('./contentVersion') : null;
var _lineUserIdModule = (typeof require !== 'undefined') ? require('./lineUserId') : null;
var _truncateToLengthModule = (typeof require !== 'undefined') ? require('./truncateToLength') : null;
var _verifyWebhookDestinationModule = (typeof require !== 'undefined') ? require('./verifyWebhookDestination') : null;

function resolveGroupBoardFor_(rows, groupId) {
  return (_lineGroupBoardModule ? _lineGroupBoardModule.resolveGroupBoard : resolveGroupBoard)(rows, groupId);
}

function classifyLineMessageFor_(event) {
  return (_lineMessageClassifyModule ? _lineMessageClassifyModule.classifyLineMessage : classifyLineMessage)(event);
}

function hasProcessedEventFor_(rows, webhookEventId) {
  return (_lineStagingModule ? _lineStagingModule.hasProcessedEvent : hasProcessedEvent)(rows, webhookEventId);
}

function markRecalledFor_(rows, webhookEventId) {
  return (_lineStagingModule ? _lineStagingModule.markRecalled : markRecalled)(rows, webhookEventId);
}

function excludeRecalledFor_(rows) {
  return (_lineStagingModule ? _lineStagingModule.excludeRecalled : excludeRecalled)(rows);
}

function saveArticleImageFor_(drive, properties, base64Data, mimeType, fileName, yyyyMM) {
  return (_imageStorageModule ? _imageStorageModule.saveArticleImage : saveArticleImage)(drive, properties, base64Data, mimeType, fileName, yyyyMM);
}

function shouldHarvestFor_(state) {
  return (_lineDigestThresholdModule ? _lineDigestThresholdModule.shouldHarvest : shouldHarvest)(state);
}

function hasResidualContentFor_(state) {
  return (_lineDigestThresholdModule ? _lineDigestThresholdModule.hasResidualContent : hasResidualContent)(state);
}

function buildDigestTitleFor_(params) {
  return (_lineArticleTitleModule ? _lineArticleTitleModule.buildDigestTitle : buildDigestTitle)(params);
}

function formatDigestContentFor_(messages) {
  return (_lineArticleContentModule ? _lineArticleContentModule.formatDigestContent : formatDigestContent)(messages);
}

function truncateToLengthFor_(str, maxLength) {
  return (_truncateToLengthModule ? _truncateToLengthModule.truncateToLength : truncateToLength)(str, maxLength);
}

function isWebhookForThisBotFor_(body, expectedBotUserId) {
  return (_verifyWebhookDestinationModule ? _verifyWebhookDestinationModule.isWebhookForThisBot : isWebhookForThisBot)(body, expectedBotUserId);
}

function computeNextDigestSequenceFor_(lastDigestDate, todayDigestCount, today) {
  return (_lineGroupBoardModule ? _lineGroupBoardModule.computeNextDigestSequence : computeNextDigestSequence)(lastDigestDate, todayDigestCount, today);
}

function createArticleUnlockedFor_(spreadsheet, input) {
  return (_postArticleModule ? _postArticleModule.createArticleUnlocked_ : createArticleUnlocked_)(spreadsheet, input);
}

function bumpBoardVersionFor_(cache, boardId, versionValue) {
  return (_contentVersionModule ? _contentVersionModule.bumpBoardVersion : bumpBoardVersion)(cache, boardId, versionValue);
}

function resolveLineUserDisplayNamesFor_(rows, userIds) {
  return (_lineUserIdModule ? _lineUserIdModule.resolveLineUserDisplayNames : resolveLineUserDisplayNames)(rows, userIds);
}

var LINE_STAGING_COLUMN_COUNT = 7; // groupId, messageTime, displayName, messageType, content, webhookEventId, recalled
var LINE_GROUP_BOARDS_COLUMN_COUNT = 5; // groupId, groupName, boardId, lastDigestDate, todayDigestCount
var LINE_USER_ID_COLUMN_COUNT = 2; // userId, displayId

/**
 * @param {Sheet} sheet
 * @returns {Array<{rowNumber: number, groupId: string, groupName: string, boardId: string, lastDigestDate: string, todayDigestCount: number}>}
 */
function readLineGroupBoardRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, lastRow - 1, LINE_GROUP_BOARDS_COLUMN_COUNT).getValues();
  return values.map(function (row, i) {
    return {
      rowNumber: i + 2,
      groupId: row[0],
      groupName: row[1],
      boardId: row[2],
      lastDigestDate: row[3] || '',
      todayDigestCount: row[4] || 0
    };
  });
}

/**
 * @param {Sheet} sheet
 * @returns {Array<{rowNumber: number, groupId: string, messageTime: string, displayName: string, messageType: string, content: string, webhookEventId: string, recalled: boolean}>}
 */
function readLineStagingRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, lastRow - 1, LINE_STAGING_COLUMN_COUNT).getValues();
  return values.map(function (row, i) {
    return {
      rowNumber: i + 2,
      groupId: row[0],
      messageTime: row[1],
      displayName: row[2],
      messageType: row[3],
      content: row[4],
      webhookEventId: row[5],
      recalled: row[6] === true
    };
  });
}

/**
 * @param {Sheet} sheet
 * @returns {Array<{rowNumber: number, userId: string, displayId: string}>}
 */
function readLineUserIdRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, lastRow - 1, LINE_USER_ID_COLUMN_COUNT).getValues();
  return values.map(function (row, i) {
    return {
      rowNumber: i + 2,
      userId: row[0],
      displayId: row[1]
    };
  });
}

/**
 * 呼叫 LINE 的訊息內容 API 下載原始畫質圖片，透過既有的 Drive 圖片儲存
 * 機制（imageStorage.js 的 saveArticleImage，本身不需要任何修改）存檔，
 * 回傳可存取連結。下載或上傳任一步驟失敗時記錄錯誤並回傳 null，呼叫端
 * 看到 null 就略過這則訊息，不讓整個 webhook 請求因為單一則圖片失敗
 * 就整批失敗（同一批次裡其他訊息的處理不受影響）。
 * @param {string} messageId
 * @param {string} channelAccessToken
 * @returns {string|null}
 */
function downloadAndStoreLineImage_(messageId, channelAccessToken) {
  try {
    var response = UrlFetchApp.fetch(
      'https://api-data.line.me/v2/bot/message/' + messageId + '/content',
      { headers: { Authorization: 'Bearer ' + channelAccessToken } }
    );
    var blob = response.getBlob();
    var base64Data = Utilities.base64Encode(blob.getBytes());
    var mimeType = blob.getContentType();
    var drive = createDriveInterface_();
    var properties = createPropertiesInterface_();
    var yyyyMM = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
    var saved = saveArticleImageFor_(drive, properties, base64Data, mimeType, messageId, yyyyMM);
    return saved.url;
  } catch (err) {
    console.error('LINE 圖片下載或上傳失敗（messageId=' + messageId + '）：' + err);
    return null;
  }
}

/**
 * 授權群組的文字、固定註記類型、圖片訊息，記錄一列到 LineStaging。
 * 回傳是否已達到分段收割門檻，讓呼叫端在這次的鎖完全釋放之後、
 * 才呼叫 harvestGroupDigest_（harvestGroupDigest_ 自己也會取鎖，
 * 提前在這裡呼叫會造成巢狀取鎖）。
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {Object} event - LINE webhook 的單一 message 事件
 * @param {string} channelAccessToken
 * @returns {{shouldHarvest: boolean, groupId?: string, boardId?: string, groupName?: string}}
 */
function captureLineMessage_(spreadsheet, lock, event, channelAccessToken) {
  var noHarvest = { shouldHarvest: false };
  var groupId = event.source && event.source.groupId;
  if (!groupId) {
    return noHarvest; // 不是群組來源的訊息（例如一對一聊天），不在這次範圍內
  }

  var classified = classifyLineMessageFor_(event);
  if (!classified) {
    return noHarvest; // 無法辨識的型態
  }

  var groupBoardsSheet = spreadsheet.getSheetByName('LineGroupBoards');
  var resolved = resolveGroupBoardFor_(readLineGroupBoardRows_(groupBoardsSheet), groupId);
  if (!resolved.authorized) {
    // 診斷用：不在白名單的群組完全不記錄訊息內容，但把 groupId/userId
    // 印到執行紀錄，方便管理者第一次把新群組登記進 LineGroupBoards 時
    // 查得到要填什麼（LINE 沒有任何介面能直接查群組 ID，只能從收到的
    // webhook 事件裡取得）。這裡刻意不印訊息內容或 displayName。
    console.log('收到未授權群組的訊息，groupId=' + groupId + '，userId=' + (event.source && event.source.userId) + '（如果這是你要加入白名單的群組，把 groupId 填進 LineGroupBoards）');
    return noHarvest;
  }

  var webhookEventId = event.message.id;
  var stagingSheet = spreadsheet.getSheetByName('LineStaging');

  // 先做一次不上鎖的去重檢查：圖片下載/上傳是慢速網路操作，不值得為了
  // 一則很可能是重送、最終會被丟棄的事件也佔用網路資源去下載。這只是
  // 最佳化，不是正確性依據——寫入前在鎖保護下還會再檢查一次。
  if (hasProcessedEventFor_(readLineStagingRows_(stagingSheet), webhookEventId)) {
    return noHarvest;
  }

  var content = classified.content;
  if (classified.messageType === 'image') {
    content = downloadAndStoreLineImage_(classified.messageId, channelAccessToken);
    if (content === null) {
      return noHarvest; // 下載或上傳失敗，已記錄錯誤
    }
  }

  lock.waitLock(10000);
  try {
    var existing = readLineStagingRows_(stagingSheet);
    if (hasProcessedEventFor_(existing, webhookEventId)) {
      return noHarvest; // 鎖保護下的權威去重檢查
    }

    // 未驗證帳號打不了「取得群組成員檔案」API（該 API 只開放給已驗證／
    // Premium 帳號），這裡先存 userId 原始值，實際顯示名稱留到彙整發文
    // 那一刻再對照 LineUserId 工作表解析（見 harvestGroupDigest_）。
    var displayName = event.source.userId;
    var messageTime = Utilities.formatDate(new Date(event.timestamp), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

    stagingSheet.appendRow([
      groupId,
      "'" + messageTime,
      displayName,
      classified.messageType,
      content,
      webhookEventId,
      false
    ]);

    // 剛寫入的這則也要算進門檻判斷，所以在鎖內、appendRow 之後重新讀一次。
    var afterWrite = readLineStagingRows_(stagingSheet).filter(function (row) { return row.groupId === groupId; });
    var imageCount = afterWrite.filter(function (row) { return row.messageType === 'image'; }).length;
    var contentLength = afterWrite.reduce(function (sum, row) { return sum + (row.content || '').length; }, 0);

    return {
      shouldHarvest: shouldHarvestFor_({ imageCount: imageCount, contentLength: contentLength }),
      groupId: groupId,
      boardId: resolved.boardId,
      groupName: resolved.groupName
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 從 LineGroupBoards 的列陣列中找到某群組對應的列（含 rowNumber，供後續
 * 更新 lastDigestDate/todayDigestCount 用）。
 * @param {Array<{rowNumber: number, groupId: string, boardId: string, lastDigestDate: string, todayDigestCount: number}>} rows
 * @param {string} groupId
 * @returns {Object|undefined}
 */
function findGroupBoardRow_(rows, groupId) {
  return rows.filter(function (row) { return row.groupId === groupId; })[0];
}


/**
 * 刪除 LineStaging 裡指定的一批列。由大到小刪，避免刪除過程中列號位移
 * 導致刪錯列。
 * @param {Sheet} sheet
 * @param {number[]} rowNumbers
 */
function deleteLineStagingRows_(sheet, rowNumbers) {
  rowNumbers.slice().sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });
}

/**
 * 把某群組當下暫存的所有內容整批彙整成一篇文章，以 SYSTEM 身分張貼進
 * 對應看板，清空已彙整的暫存列，並更新 LineGroupBoards 的
 * lastDigestDate/todayDigestCount。全程只用同一把鎖（不巢狀取鎖）：
 * 讀暫存、算序號、組標題/內文、呼叫不上鎖的 createArticleUnlocked_、
 * 刪暫存列、更新對應表，這整段都在同一次 waitLock/releaseLock 之間完成。
 * bumpBoardVersion/bumpBoardActivity_ 比照既有 postArticleFromForm 的慣例，
 * 在鎖釋放之後才呼叫。
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {Cache} cache
 * @param {string} groupId
 * @param {string} boardId
 * @param {string} groupName
 */
function harvestGroupDigest_(spreadsheet, lock, cache, groupId, boardId, groupName) {
  var stagingSheet = spreadsheet.getSheetByName('LineStaging');
  var groupBoardsSheet = spreadsheet.getSheetByName('LineGroupBoards');
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  var today = createdAt.slice(0, 10);

  lock.waitLock(10000);
  try {
    var staged = readLineStagingRows_(stagingSheet).filter(function (row) { return row.groupId === groupId; });
    if (staged.length === 0) {
      return; // 沒有暫存內容，不觸發收割、不產生空文章
    }

    // 已收回的訊息不納入最終文章（原本是納入、只在內容後面加註記「（訊息
    // 已收回）」，改成完全不納入，見對話紀錄；連帶修正了一個原本存在的
    // 問題：即使是已收回的圖片訊息，原本也還是會把圖片連結放進
    // imageUrls，讓收回的圖片依然出現在文章裡）。如果這批暫存訊息扣掉
    // 已收回的之後完全沒有剩下任何內容，代表大家講的話全部都收回了，
    // 沒有東西可以彙整——這批暫存還是要清掉（已經處理過，不留著跟未來
    // 的新訊息混在一起），但不建立一篇空文章、也不推進當天的彙整序號
    // （沒有真的產生文章，序號不該跳號）。
    var includedRows = excludeRecalledFor_(staged);
    if (includedRows.length === 0) {
      deleteLineStagingRows_(stagingSheet, staged.map(function (row) { return row.rowNumber; }));
      return;
    }

    var groupBoardRows = readLineGroupBoardRows_(groupBoardsSheet);
    var groupBoardRow = findGroupBoardRow_(groupBoardRows, groupId);
    var sequenceNumber = computeNextDigestSequenceFor_(
      groupBoardRow ? groupBoardRow.lastDigestDate : '',
      groupBoardRow ? groupBoardRow.todayDigestCount : 0,
      today
    );

    var title = buildDigestTitleFor_({
      date: today,
      groupName: groupName,
      sequenceNumber: sequenceNumber
    });

    // row.displayName 目前存的是 event.source.userId 原始值（見
    // captureLineMessage_，未驗證帳號打不了 LINE 的「取得群組成員檔案」
    // API）。這裡查 LineUserId 工作表，換成管理者手動維護的顯示名稱；
    // 查不到的 userId 先原樣顯示、同時登記一筆預設列到 LineUserId，
    // 讓管理者之後能自己改成看得懂的名字。userIdSheet 理論上一定存在
    // （ensureSchema 會自動建立），這裡仍防禦性地檢查一次，找不到就
    // 直接原樣顯示 userId，不讓彙整發文因為這張表而整批失敗。
    var userIdSheet = spreadsheet.getSheetByName('LineUserId');
    var displayNameByUserId = {};
    if (userIdSheet) {
      var userIdRows = readLineUserIdRows_(userIdSheet);
      var resolvedNames = resolveLineUserDisplayNamesFor_(userIdRows, staged.map(function (row) { return row.displayName; }));
      displayNameByUserId = resolvedNames.displayNameByUserId;
      resolvedNames.newRows.forEach(function (row) {
        userIdSheet.appendRow([row.userId, row.displayId]);
      });
    }

    var imageUrls = [];
    var messages = includedRows.map(function (row) {
      var displayContent = row.content;
      if (row.messageType === 'image') {
        imageUrls.push(row.content); // row.content 是圖片的 Drive 連結
        // 編號用 imageUrls 當下的長度（push 完剛好是 1-indexed 的第幾張），
        // 跟下方縮圖（Index.html 的 renderArticleImages 依 imageUrls 陣列
        // 順序渲染，沒有另外排序）的順序一致，方便對照文字對應到哪一張圖。
        displayContent = '（圖片，見下方縮圖' + imageUrls.length + '）';
      }
      var displayName = displayNameByUserId.hasOwnProperty(row.displayName) ? displayNameByUserId[row.displayName] : row.displayName;
      return { time: row.messageTime.slice(11, 16), displayName: displayName, content: displayContent };
    });
    var content = formatDigestContentFor_(messages);

    // 安全性審查 L4 修復：createArticleUnlockedFor_ 刻意不驗證長度（見它的
    // 註解——避免在已持鎖的收割流程裡巢狀呼叫 createArticle 的
    // validateArticleTitle/validateArticleContent），代表這條路徑原本
    // 完全不受標題 100 字、內文 10000 字這個業務規則約束。目前用收割
    // 門檻（累積內文 ≥8000 字或圖片數 ≥99 任一觸發，見
    // lineDigestThreshold.js）把大部分情況控制在上限以下，但這是機率性
    // 的緩解，不是強制保證——例如同一批次最後一則訊息本身就很長，仍有
    // 機會讓組出來的內文超過上限。這裡截斷而不是直接放棄整批彙整（放棄
    // 的話，LineStaging 裡的訊息會一直堆積、下次收割還是同一個問題），
    // 讓這條路徑的行為跟其他發文路徑的業務規則保持一致。
    var titleMaxLength = _postArticleModule ? _postArticleModule.ARTICLE_TITLE_MAX_LENGTH : ARTICLE_TITLE_MAX_LENGTH;
    var contentMaxLength = _postArticleModule ? _postArticleModule.ARTICLE_CONTENT_MAX_LENGTH : ARTICLE_CONTENT_MAX_LENGTH;
    title = truncateToLengthFor_(title, titleMaxLength);
    content = truncateToLengthFor_(content, contentMaxLength);

    var result = createArticleUnlockedFor_(spreadsheet, {
      articleId: Utilities.getUuid(),
      boardId: boardId,
      title: title,
      content: content,
      imageUrls: imageUrls,
      author: 'SYSTEM',
      createdAt: createdAt
    });
    if (!result.success) {
      return;
    }

    deleteLineStagingRows_(stagingSheet, staged.map(function (row) { return row.rowNumber; }));

    if (groupBoardRow) {
      groupBoardsSheet.getRange(groupBoardRow.rowNumber, 4, 1, 2).setValues([["'" + today, sequenceNumber]]);
    }
  } finally {
    lock.releaseLock();
  }

  var newVersion = Utilities.getUuid();
  bumpBoardVersionFor_(cache, boardId, newVersion);
  bumpBoardActivity_(spreadsheet.getSheetByName('Boards'), boardId, BOARD_LATEST_ARTICLE_AT_COLUMN, createdAt);
}

/**
 * LINE 的 unsend 事件：把仍在暫存階段、對應原始訊息的那一列標記為已收回。
 * 找不到對應列（訊息已被彙整張貼、暫存列已刪除）時不做任何修改、不報錯。
 * @param {Spreadsheet} spreadsheet
 * @param {Lock} lock
 * @param {Object} event - LINE webhook 的 unsend 事件
 */
function handleLineUnsend_(spreadsheet, lock, event) {
  var webhookEventId = event.unsend && event.unsend.messageId;
  if (!webhookEventId) {
    return;
  }

  var stagingSheet = spreadsheet.getSheetByName('LineStaging');

  lock.waitLock(10000);
  try {
    var existing = readLineStagingRows_(stagingSheet);
    var target = existing.filter(function (row) { return row.webhookEventId === webhookEventId; })[0];
    if (!target) {
      return; // 已被彙整張貼、暫存列已刪除，不做任何修改
    }

    var updated = markRecalledFor_(existing, webhookEventId);
    var updatedRow = updated.filter(function (row) { return row.webhookEventId === webhookEventId; })[0];
    stagingSheet.getRange(target.rowNumber, LINE_STAGING_COLUMN_COUNT, 1, 1).setValues([[updatedRow.recalled]]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 每日換日檢查：逐一走訪 LineGroupBoards 每一列，用 hasResidualContent
 * 判斷該群組是否還有殘餘暫存內容（沒達到一般收割門檻，但換日了仍該
 * 收割送出當天最後一篇）。完全沒有任何暫存對話的群組，不會被觸發任何
 * 發文。由每日 00:05（Asia/Taipei）的 installable trigger 呼叫。
 */
function dailyLineDigestCheck() {
  var spreadsheet = getSpreadsheet_();
  var lock = LockService.getScriptLock();
  var cache = CacheService.getScriptCache();
  var groupBoardsSheet = spreadsheet.getSheetByName('LineGroupBoards');
  var stagingSheet = spreadsheet.getSheetByName('LineStaging');

  var groupBoardRows = readLineGroupBoardRows_(groupBoardsSheet);
  var stagingRows = readLineStagingRows_(stagingSheet);

  groupBoardRows.forEach(function (groupBoardRow) {
    var groupStaging = stagingRows.filter(function (row) { return row.groupId === groupBoardRow.groupId; });
    var imageCount = groupStaging.filter(function (row) { return row.messageType === 'image'; }).length;
    var contentLength = groupStaging.reduce(function (sum, row) { return sum + (row.content || '').length; }, 0);

    if (hasResidualContentFor_({ imageCount: imageCount, contentLength: contentLength })) {
      harvestGroupDigest_(spreadsheet, lock, cache, groupBoardRow.groupId, groupBoardRow.boardId, groupBoardRow.groupName);
    }
  });
}

/**
 * 一次性的安裝函式：建立每日 00:05（Asia/Taipei）的 installable
 * time-driven trigger，handler 指向 dailyLineDigestCheck。安裝前先檢查
 * 是否已存在同一個 handler function 的 time-driven trigger，存在就跳過
 * 不重複建立，避免管理者不小心重複執行導致同一天被收割兩次。
 * 在 Apps Script 編輯器手動執行一次即可，不需要重複呼叫。
 */
function installDailyLineDigestTrigger() {
  var alreadyInstalled = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'dailyLineDigestCheck';
  });
  if (alreadyInstalled) {
    return;
  }

  ScriptApp.newTrigger('dailyLineDigestCheck')
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();
}

/**
 * LINE Messaging API webhook 進入點。
 * @param {Object} e - Apps Script doPost 事件物件
 */
function doPost(e) {
  var properties = PropertiesService.getScriptProperties();
  var body = JSON.parse(e.postData.contents);

  // 安全性審查 M3 修復：見 verifyWebhookDestination.js 開頭的說明。這不是
  // 簽章驗證（GAS 的 doPost(e) 讀不到 X-Line-Signature 標頭），只是
  // 「這個請求聲稱要給我們的 bot」這件事本身有沒有對，屬於縱深防禦，
  // 不取代下面既有的 groupId 白名單。放在最前面、拿到 Spreadsheet/Lock/
  // Cache 之前就先檢查，不符合的請求不需要為它們多做任何準備工作。
  // 回應維持跟正常情況一樣的空白 200，不讓外部探測者能從回應內容分辨
  // 出「是不是猜對了 destination」。
  var expectedBotUserId = properties.getProperty('LINE_BOT_USER_ID');
  if (!isWebhookForThisBotFor_(body, expectedBotUserId)) {
    console.log('收到 destination 不符的 webhook 請求，body.destination=' + (body && body.destination) + '（如果這是正常流量，檢查 Script Properties 的 LINE_BOT_USER_ID 是否設定正確）');
    return ContentService.createTextOutput('');
  }

  var spreadsheet = getSpreadsheet_();
  var lock = LockService.getScriptLock();
  var cache = CacheService.getScriptCache();
  var channelAccessToken = properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  (body.events || []).forEach(function (event) {
    if (event.type === 'message') {
      var captureResult = captureLineMessage_(spreadsheet, lock, event, channelAccessToken);
      if (captureResult.shouldHarvest) {
        harvestGroupDigest_(spreadsheet, lock, cache, captureResult.groupId, captureResult.boardId, captureResult.groupName);
      }
    } else if (event.type === 'unsend') {
      handleLineUnsend_(spreadsheet, lock, event);
    }
    // 其他事件型態（成員加入/退出等）直接略過，不建立任何暫存紀錄。
  });

  return ContentService.createTextOutput('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doPost: doPost,
    readLineGroupBoardRows_: readLineGroupBoardRows_,
    readLineStagingRows_: readLineStagingRows_,
    readLineUserIdRows_: readLineUserIdRows_,
    captureLineMessage_: captureLineMessage_,
    downloadAndStoreLineImage_: downloadAndStoreLineImage_,
    handleLineUnsend_: handleLineUnsend_,
    harvestGroupDigest_: harvestGroupDigest_,
    dailyLineDigestCheck: dailyLineDigestCheck,
    installDailyLineDigestTrigger: installDailyLineDigestTrigger
  };
}
