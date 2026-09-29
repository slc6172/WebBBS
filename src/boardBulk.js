/**
 * Perf-optimization ticket 04. Assembles one page of a board's full
 * data — articles with content/images AND their replies — in as few
 * sheet reads as the shape allows: one read of Articles (all columns,
 * so pagination/sorting/content are all available without a second
 * pass) and one read of Replies (the whole sheet, grouped by articleId
 * in JS) regardless of how many articles land on the page. This is the
 * pure, testable core; gating (does this role/session get to see this
 * board at all) and the version-stamp short-circuit happen one layer up
 * in Code.js (ticket 05), same split as listArticlesByBoard vs
 * getArticlesForRole.
 */
var BOARD_BULK_PAGE_SIZE = 300; // 可調整的批次篇數上限，見 ticket 05 如何餵進來

var _textCoercionModule = (typeof require !== 'undefined') ? require('./textCoercion') : null;
function toSafeDisplayStringFor_(value) {
  return (_textCoercionModule ? _textCoercionModule.toSafeDisplayString_ : toSafeDisplayString_)(value);
}

/**
 * 圖片張數突破：Articles 表的圖片欄位從 imageUrl1~3 三欄合併成單一個
 * JSON 陣列字串欄位。空值的標準表示法是 '[]'；任何無法解析的內容（理論上
 * 不該發生，防禦性處理）都當成沒有圖片，不噴錯。
 * @param {string} cellValue
 * @returns {Array<string>}
 */
function parseImageUrlsCell_(cellValue) {
  if (!cellValue) {
    return [];
  }
  try {
    var parsed = JSON.parse(cellValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Reads every article belonging to boardId, full row (including
 * content and the three image columns), sorted newest first. One
 * range read regardless of how many rows the sheet has in total.
 * @param {Sheet} sheet
 * @param {string} boardId
 * @returns {Array}
 */
function readArticlesForBoard_(sheet, boardId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var articles = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row[1] !== boardId) {
      continue;
    }
    articles.push({
      articleId: row[0],
      boardId: row[1],
      title: toSafeDisplayStringFor_(row[2]),
      author: row[3],
      content: toSafeDisplayStringFor_(row[4]),
      createdAt: row[5],
      editedAt: row[6],
      editedBy: row[7],
      replyCount: row[8],
      imageUrls: parseImageUrlsCell_(row[9])
    });
  }

  articles.sort(function (a, b) {
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? 1 : -1; // newest first
  });

  return articles;
}

/**
 * Reads the entire Replies sheet exactly once, then groups into
 * articleId buckets — regardless of how many distinct articleIds are
 * requested, this is always a single range read, unlike the old
 * per-article listRepliesByArticle (still used elsewhere) which
 * re-scans the whole sheet once per article opened. Every id in
 * articleIds gets a key in the result, even with zero replies (empty
 * array, not a missing key) — replies for ids NOT in articleIds are
 * read (can't avoid that with one full-sheet read) but discarded, never
 * appearing in the result.
 * @param {Sheet} sheet
 * @param {string[]} articleIds
 * @returns {Object.<string, Array>}
 */
function groupRepliesByArticleId_(sheet, articleIds) {
  var grouped = {};
  articleIds.forEach(function (id) {
    grouped[id] = [];
  });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return grouped;
  }

  var wanted = {};
  articleIds.forEach(function (id) {
    wanted[id] = true;
  });

  var rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!wanted[row[1]]) {
      continue;
    }
    grouped[row[1]].push({
      replyId: row[0],
      articleId: row[1],
      author: row[2],
      content: toSafeDisplayStringFor_(row[3]),
      createdAt: row[4]
    });
  }

  return grouped;
}

/**
 * @param {Spreadsheet} spreadsheet
 * @param {string} boardId
 * @param {number} pageIndex - 0-based
 * @param {number} [pageSize]
 * @returns {{articles: Array, repliesByArticleId: Object, hasMore: boolean, totalCount: number, pageSize: number}}
 */
function getBoardBulkPage_(spreadsheet, boardId, pageIndex, pageSize) {
  var size = pageSize || BOARD_BULK_PAGE_SIZE;
  var allArticles = readArticlesForBoard_(spreadsheet.getSheetByName('Articles'), boardId);
  // 安全性審查 M2 修復：pageIndex 是客戶端直接傳入的參數，負數會讓
  // Array.slice 的負數起點語意從陣列尾端算起（不是我們要的「翻到某一
  // 頁」語意），非整數/非數字則可能算出 NaN 的 start。這裡正規化成
  // 非負整數，不符合就當作第 0 頁，不噴錯——純運算，不影響讀取次數。
  var normalizedPageIndex = Math.max(0, Math.floor(Number(pageIndex) || 0));
  var start = normalizedPageIndex * size;
  var pageArticles = allArticles.slice(start, start + size);
  var articleIds = pageArticles.map(function (a) { return a.articleId; });

  // 跳頁功能用：totalCount 是 allArticles.length，這裡已經算好在手上（讀表跟排序
  // 本來就要做一次），往外多回傳這一個數字不需要多一次讀取或多一次排序。前端拿
  // 這個數字換算 totalPages = ceil(totalCount / pageSize)，藉此顯示「共幾頁」並
  // 限制跳頁輸入範圍，不需要讓使用者自己亂猜。pageSize 一併回傳，是因為呼叫端
  // （getBoardBulkFromToken）目前固定用同一個 BOARD_BULK_PAGE_SIZE，但這裡的
  // 參數本來就允許被覆寫，把「這次實際用的 pageSize」明確回傳，前端換算頁數時
  // 才不會跟後端可能已經調整過的批次上限兜不起來。
  return {
    articles: pageArticles,
    repliesByArticleId: groupRepliesByArticleId_(spreadsheet.getSheetByName('Replies'), articleIds),
    hasMore: start + size < allArticles.length,
    totalCount: allArticles.length,
    pageSize: size
  };
}

/**
 * 找出 articleId 目前排序下落在哪一頁（0-based），供寫入端點（Code.js）在編輯
 * 文章、發表/刪除回覆時，正確 bump 該文章「真正所在頁次」的版本 key，而不是
 * 寫死 :page0——跳頁功能上線後，使用者很容易直接停留在很舊的頁次編輯/回覆，
 * 只 bump 第 0 頁的版本會讓其他還停在那一頁的使用者一直看到過期內容。
 * 找不到（文章已被刪除，或 boardId 不符）回傳 null。
 * @param {Spreadsheet} spreadsheet
 * @param {string} boardId
 * @param {string} articleId
 * @param {number} [pageSize]
 * @returns {number|null}
 */
function findArticlePageIndex(spreadsheet, boardId, articleId, pageSize) {
  var size = pageSize || BOARD_BULK_PAGE_SIZE;
  var allArticles = readArticlesForBoard_(spreadsheet.getSheetByName('Articles'), boardId);
  var index = -1;
  for (var i = 0; i < allArticles.length; i++) {
    if (allArticles[i].articleId === articleId) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return null;
  }
  return Math.floor(index / size);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getBoardBulkPage_: getBoardBulkPage_,
    findArticlePageIndex: findArticlePageIndex,
    BOARD_BULK_PAGE_SIZE: BOARD_BULK_PAGE_SIZE
  };
}
