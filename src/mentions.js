/**
 * Ticket 05（@提及偵測與寫入）。
 */
var _loginModule = (typeof require !== 'undefined') ? require('./login') : null;
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _boardsModule = (typeof require !== 'undefined') ? require('./boards') : null;

function getUserRecordFor_(sheet, userId) {
  return (_loginModule ? _loginModule.getUserRecord_ : getUserRecord_)(sheet, userId);
}

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions_ : getRolePermissions_)(spreadsheet, role);
}

function boardAllowsRoleByIdFor_(spreadsheet, boardId, role) {
  return (_boardsModule ? _boardsModule.boardAllowsRoleById : boardAllowsRoleById)(spreadsheet, boardId, role);
}

// mycr 第 15 輪票 05：這個檔案原本在這裡放了一份 escapeFormulaInjection
// 的本地複本（見 round-14 交接文件「尚未處理」清單），因為當時
// postArticle.js require 這個檔案，反向 require 會形成循環。現在
// escapeFormulaInjection 的正本已經搬到 formulaInjection.js——一個完全
// 沒有任何 require 依賴的葉節點模組，不會有循環風險。但這個檔案裡唯一
// 呼叫這份本地複本的地方（buildMentionEntry_ 對 articleTitle 的跳脫）
// 本身也在票 05 一併移除了（articleTitle 是巢狀在 JSON 字串裡的欄位，
// 不是獨立儲存格，跳脫從來沒有真的防到 Sheets 層級的風險，詳見
// buildMentionEntry_ 上方的說明）——這裡不需要重新委派到
// formulaInjection.js，直接刪掉這個檔案裡用不到的函式即可。

// 跟 validateUserId（register.js）的格式規則一致：4~20 個英數字/底線。
var MENTION_PATTERN = /@([A-Za-z0-9_]{4,20})/g;

// pendingMentions 上限（bug-fix 輪）：長期不登入（離職／休眠／被鎖定測試用）的
// 帳號如果持續被 @提及，這個 JSON 陣列會一直長大，理論上可能撞到 Sheets 單一
// 儲存格 50,000 字元的上限，導致寫入失敗或內容被截斷。單筆 entry 最壞情況
// （userId 上限 20 字元、boardId 抓寬鬆 30 字元、articleId 是 36 字元的 UUID、
// articleTitle 上限 100 字元+跳脫、createdAt 時間戳 19 字元、加上 JSON key/
// 語法本身的開銷）約 285 字元；比照原始 spec 裡 content 欄位「上限 10,000 字元，
// 對照 Sheets 50,000 上限留安全餘裕」的同一種安全邊際（約 20%），50 筆
// （50 × 285 ≈ 14,250 字元，約占上限的 28%，仍有近 3.5 倍餘裕）也已經是登入
// 清單 UI 上使用者願意逐一點開看的合理上限，再多其實也沒意義。
var MAX_PENDING_MENTIONS = 50;

/**
 * 從一段文字裡擷取候選 @userId（純字串比對，不驗證是否真實存在）。
 * @param {string} text
 * @returns {string[]} 依出現順序、去重後的候選 userId 清單
 */
function extractMentionCandidates_(text) {
  if (!text) {
    return [];
  }
  var seen = {};
  var result = [];
  var match;
  MENTION_PATTERN.lastIndex = 0; // 全域 regex 帶狀態，重複呼叫前保險歸零
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    var candidate = match[1];
    if (!seen[candidate]) {
      seen[candidate] = true;
      result.push(candidate);
    }
  }
  return result;
}

// API4（換角度複查輪，對照 OWASP API Security Top 10 2023——Unrestricted
// Resource Consumption）：一篇文章/回覆能 @提及的人數本來完全沒有上限，
// recordMentionsForContent_ 對每一個候選人都要讀 Users/Permission/Boards
// 三張表、搶一次全站鎖才能寫入，內容上限一萬字理論上塞得下數百個候選人，
// 沒有上限代表單次請求的試算表讀寫次數跟鎖等待時間都沒有上限。20 這個
// 數字：一篇公開討論串貼文合理提及超過 20 個人已經是異常使用方式，跟
// MAX_PENDING_MENTIONS=50 是同一種「抓一個明顯遠高於正常使用情境、但
// 足以擋住異常量的門檻」的抓法。
//
// 設計成拒絕整篇貼文（跟標題/內容驗證同一個模式），不是靜默截斷：
// 「這篇文章打了幾個 @」是發文者自己完全看得到、自己能修改的事，跟
// 「@bob02 到底存不存在」這種發文者不一定知道的事是不同類型的問題，
// 後者才適合靜默略過（recordMentionsForContent_ 既有的行為，這裡不變）。
var MAX_MENTIONS_PER_POST = 20;

/**
 * 純函式：檢查文章/回覆內容裡 @提及的相異人數是否超過上限。不觸碰任何
 * 試算表——只對呼叫端已經在記憶體裡的字串跑一次 regex，跟真正花錢的
 * SpreadsheetApp 讀寫次數完全無關；這個檢查真正的效益，是讓
 * recordMentionsForContent_ 那個目前沒有上限的迴圈永遠不會被餵超過
 * MAX_MENTIONS_PER_POST 個候選人。
 * @param {string} text
 * @returns {{valid: boolean, error?: string}}
 */
function validateMentionCount_(text) {
  if (extractMentionCandidates_(text).length > MAX_MENTIONS_PER_POST) {
    return { valid: false, error: '一篇最多只能 @提及 ' + MAX_MENTIONS_PER_POST + ' 人，請減少後再送出' };
  }
  return { valid: true };
}

/**
 * 解析目前儲存格的 pendingMentions 原始 JSON——比照 boardActivity.js 的
 * getLastSeenBoards 同一套防禦寫法：空值/非陣列/解析失敗一律當「沒有任何
 * 待通知的提及」，不拋錯。
 * @param {string|null|undefined} rawJson
 * @returns {Array}
 */
function getPendingMentions_(rawJson) {
  if (!rawJson) {
    return [];
  }
  try {
    var parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * 把一筆新的提及記錄附加進既有清單，回傳新的 JSON 字串。超過 MAX_PENDING_MENTIONS
 * 筆時，悄悄捨棄最舊的（陣列開頭）、只保留最新的 N 筆——不報錯、不通知任何人，
 * 跟這個模組其他地方「靜默略過」的慣例一致。放在這裡（而不是呼叫端
 * recordMentionsForContent_）是因為這支函式本身就有獨立的單元測試在覆蓋，
 * 裁切邏輯放這裡可以保證不管未來哪個呼叫端呼叫它都不會超過上限，也不用另外
 * 搭 spreadsheet/lock fake 才測得到邊界情況。
 * @param {string|null|undefined} rawJson - 目前儲存格的原始值
 * @param {Object} entry
 * @returns {string}
 */
function appendPendingMention_(rawJson, entry) {
  var current = getPendingMentions_(rawJson);
  current.push(entry);
  if (current.length > MAX_PENDING_MENTIONS) {
    current = current.slice(current.length - MAX_PENDING_MENTIONS);
  }
  return JSON.stringify(current);
}

/**
 * 把一次成功的提及組成單筆通知記錄的固定形狀，供 appendPendingMention_
 * 附加使用。board 名稱刻意不在這裡查——boardId 就夠，顯示成看板名稱是
 * 前端登入清單（ticket 06）用它已經有的 allBoards 資料自己轉換，這裡不用
 * 為了取名稱多讀一次 Boards 表。
 *
 * articleTitle 套用跟 postArticle.js 的 title/content/imageUrls 同一套
 * escapeFormulaInjection——縱深防禦，這裡是唯一真正的自由文字（其他欄位
 * 都是已經在別處驗證過格式的識別碼：userId、boardId、articleId），不因為
 * 存進 JSON 陣列、整個儲存格開頭固定是 [ 就假設不需要跳脫。
 * @param {{mentionedBy: string, boardId: string, articleId: string, articleTitle: string, timestamp: string}} params
 * @returns {{mentionedBy: string, boardId: string, articleId: string, articleTitle: string, createdAt: string}}
 */
function buildMentionEntry_(params) {
  // mycr 第 15 輪票 05：這裡原本對 articleTitle 套用
  // escapeFormulaInjectionFor_，理由是「跟 postArticle.js 對 title 做
  // 同一種跳脫，防禦縱深」——但這個欄位是先組成 JS 物件、整包
  // JSON.stringify 之後才寫進 Users 表第 11 欄「一整格」，不是自己獨立
  // 佔一格。Sheets 的公式/型別誤判只發生在「整格」層級：這一整格的值
  // 是 JSON.stringify 後的陣列字串，永遠以 `[` 開頭，不可能被誤判成
  // 公式或被轉換型別，所以對 articleTitle 這個巢狀欄位做跳脫，從來沒有
  // 真的防到 Sheets 層級的任何風險。
  //
  // escapeFormulaInjection 現在改成「非空字串一律加前綴」（見
  // formulaInjection.js），如果繼續在這裡呼叫，會讓前綴字元變成
  // JSON.parse 之後 articleTitle 裡真的看得到的一個字元（Sheets 對整格
  // 開頭撇號的自動去除，不會處理巢狀在字串內部的撇號）——等於讓每一則
  // @提及通知的標題都多一個游離的撇號，這是先前只在標題剛好以 =+-@
  // 開頭時才會出現的既有小瑕疵，現在會擴大成每一則通知都出現。拿掉這個
  // 呼叫點：不影響任何真實存在的防護，同時修掉這個一併發現的既有瑕疵。
  return {
    mentionedBy: params.mentionedBy,
    boardId: params.boardId,
    articleId: params.articleId,
    articleTitle: params.articleTitle,
    createdAt: params.timestamp
  };
}

/**
 * 整合函式：從一段內容裡找出有效的 @提及對象，逐一寫進他們各自的
 * pendingMentions 欄位。「有效」的定義：真實存在、角色對這篇文章所在的
 * 看板有讀取權限（全域 articleRead + 這個看板的 AllowRoles 都要過）、
 * 不是提及者自己。任何一項不滿足就靜默略過，不報錯、不通知任何人。
 *
 * 每個目標各自獨立取一次短鎖：existence/permission 檢查（不需要鎖，只是
 * 讀）在鎖外先做，真正要讀取-修改-寫回 pendingMentions 欄位時才上鎖，而且
 * 在鎖裡重新讀一次目前的值（不是沿用鎖外檢查時讀到的舊值）才附加寫回——
 * 避免「查完存在性到真的拿到鎖之間，剛好有別人先寫入」的更新遺失。
 *
 * 呼叫時機的重要限制：這個函式自己會呼叫 lock.waitLock()/releaseLock()，
 * 呼叫端（createArticleForRole/createReplyForRole）必須確保呼叫這個函式
 * 之前，自己原本那個保護寫入文章/回覆的鎖已經 releaseLock() 過了——GAS 的
 * script lock 不是可重入鎖，在還持有鎖的情況下巢狀再次 waitLock() 會直接
 * 卡死等到逾時，不會拋出好懂的錯誤。
 *
 * @param {Object} spreadsheet
 * @param {Object} lock
 * @param {{text: string, mentionedBy: string, boardId: string, articleId: string, articleTitle: string, timestamp: string}} params
 */
function recordMentionsForContent_(spreadsheet, lock, params) {
  var candidates = extractMentionCandidates_(params.text);
  if (candidates.length === 0) {
    return;
  }
  var usersSheet = spreadsheet.getSheetByName('Users');

  candidates.forEach(function (candidateUserId) {
    if (candidateUserId === params.mentionedBy) {
      return; // 排除自我提及
    }
    var targetUser = getUserRecordFor_(usersSheet, candidateUserId);
    if (!targetUser) {
      return; // 不存在的 userId，靜默略過
    }
    if (!getRolePermissionsFor_(spreadsheet, targetUser.role).articleRead) {
      return; // 這個角色全域就沒有讀取權限
    }
    if (!boardAllowsRoleByIdFor_(spreadsheet, params.boardId, targetUser.role)) {
      return; // 這個角色對這個看板沒有讀取權限
    }

    var entry = buildMentionEntry_({
      mentionedBy: params.mentionedBy,
      boardId: params.boardId,
      articleId: params.articleId,
      articleTitle: params.articleTitle,
      timestamp: params.timestamp
    });

    // mycr 第 15 輪票 04（見 F-05）：這支函式在呼叫端的文章/回覆列都已經
    // 寫入試算表、呼叫端自己的寫入鎖也已經釋放之後才執行——如果這裡讓
    // 例外往上傳，使用者會看到「發文/回覆失敗」，但內容其實已經寫入，
    // 重試就會重複發文。取鎖逾時或鎖內寫入本身失敗，都只當成「這一位
    // 提及對象沒收到通知」處理，記錄下來、繼續處理下一位候選人，不中斷
    // 整個迴圈——跟這支函式其他地方（不存在的 userId、鎖內重讀發現列
    // 被刪除）採用同一種「靜默略過、繼續處理下一個」的既有慣例一致。
    var lockAcquired = false;
    try {
      lock.waitLock(10000);
      lockAcquired = true;
      var freshRecord = getUserRecordFor_(usersSheet, candidateUserId);
      if (!freshRecord) {
        return; // 資安複審（`/mycr` 深層複掃）：外層存在性檢查通過之後、真正
                 // 拿到鎖之前的極窄時間窗內，管理者剛好手動刪除這一列——比照
                 // 這支函式其他地方「靜默略過、繼續處理下一個候選人」的既有
                 // 慣例，不讓這裡的未防護 null 存取拋出例外中斷整個迴圈。
      }
      var updated = appendPendingMention_(freshRecord.pendingMentions, entry);
      usersSheet.getRange(freshRecord.row_, 11, 1, 1).setValues([[updated]]);
    } catch (e) {
      console.error('recordMentionsForContent_: 處理 @' + candidateUserId + ' 的提及時發生錯誤，略過這一位，繼續處理其他候選人 — ' + e);
    } finally {
      if (lockAcquired) {
        lock.releaseLock();
      }
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_PENDING_MENTIONS: MAX_PENDING_MENTIONS,
    MAX_MENTIONS_PER_POST: MAX_MENTIONS_PER_POST,
    extractMentionCandidates_: extractMentionCandidates_,
    validateMentionCount_: validateMentionCount_,
    getPendingMentions_: getPendingMentions_,
    appendPendingMention_: appendPendingMention_,
    buildMentionEntry_: buildMentionEntry_,
    recordMentionsForContent_: recordMentionsForContent_
  };
}
