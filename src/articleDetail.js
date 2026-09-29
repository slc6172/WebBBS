/**
 * Ticket 08 — article detail page & reply display.
 *
 * getArticleDetailForRole (live Permission/Boards reads on every call)
 * was replaced by getArticleDetailForSnapshot below as part of
 * perf-optimization ticket 03 — its only caller (Code.js's
 * getArticleDetailFromToken) now passes the already-cached session
 * snapshot instead of a bare role string, so there is no live-checking
 * sibling left to keep around.
 */
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;
var _textCoercionModule = (typeof require !== 'undefined') ? require('./textCoercion') : null;

function snapshotIncludesBoardFor_(snapshot, boardId) {
  return (_permissionsModule ? _permissionsModule.snapshotIncludesBoard : snapshotIncludesBoard)(snapshot, boardId);
}

function toSafeDisplayStringFor_(value) {
  return (_textCoercionModule ? _textCoercionModule.toSafeDisplayString_ : toSafeDisplayString_)(value);
}

/**
 * Reads a single article's full record, including content (unlike
 * ticket 06's listArticlesByBoard, which deliberately skips it), plus
 * editedAt/editedBy for the "edited" badge and imageUrls (圖片張數突破：
 * 原本的 imageUrl1~3 三欄併成單一 JSON 陣列欄位，取代優化輪 ticket 09
 * 的固定 3 張限制) for the below-content thumbnails.
 * @param {Spreadsheet} spreadsheet
 * @param {string} articleId
 * @returns {{articleId: string, boardId: string, title: string, author: string, content: string, createdAt: string, editedAt: string, editedBy: string, imageUrls: Array<string>}|null}
 */
function getArticleById(spreadsheet, articleId) {
  var sheet = spreadsheet.getSheetByName('Articles');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === articleId) {
      return {
        articleId: rows[i][0],
        boardId: rows[i][1],
        title: toSafeDisplayStringFor_(rows[i][2]),
        author: rows[i][3],
        content: toSafeDisplayStringFor_(rows[i][4]),
        createdAt: rows[i][5],
        editedAt: rows[i][6],
        editedBy: rows[i][7],
        imageUrls: parseImageUrlsCell_(rows[i][9])
      };
    }
  }
  return null;
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
 * Reads replies for the given article, oldest first (thread reads
 * top-to-bottom, newest reply naturally lands at the bottom).
 * @param {Spreadsheet} spreadsheet
 * @param {string} articleId
 * @returns {{replyId: string, articleId: string, author: string, content: string, createdAt: string}[]}
 */
function listRepliesByArticle(spreadsheet, articleId) {
  var sheet = spreadsheet.getSheetByName('Replies');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var replies = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] !== articleId) {
      continue;
    }
    replies.push({
      replyId: rows[i][0],
      articleId: rows[i][1],
      author: rows[i][2],
      content: toSafeDisplayStringFor_(rows[i][3]),
      createdAt: rows[i][4]
    });
  }

  replies.sort(function (a, b) {
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? -1 : 1; // oldest first
  });

  return replies;
}

/**
 * Snapshot-based gating (perf-optimization ticket 03): article and
 * replies are each independently gated by articleRead/replyRead, and
 * both additionally require the article's board to be allowed — same
 * decision shape as the original getArticleDetailForRole, just fed
 * entirely from an already-built session snapshot (see
 * getArticleDetailForSnapshot below) instead of live Permission/Boards
 * reads. 文章不存在時兩者皆為空，跟「沒有 articleRead 權限」看起來一樣
 * （deliberately consistent with ticket 11's "deleted article is
 * indistinguishable from never having existed" behavior）。
 * @param {Spreadsheet} spreadsheet
 * @param {{permissions: Object, allowedBoardIds: string[]}|null} snapshot
 * @param {string} articleId
 * @returns {{article: Object|null, replies: Array}}
 */
function getArticleDetailForSnapshot_(spreadsheet, snapshot, articleId) {
  var article = getArticleById(spreadsheet, articleId);
  if (!article) {
    return { article: null, replies: [] };
  }

  var boardOk = snapshotIncludesBoardFor_(snapshot, article.boardId);
  var permissions = (snapshot && snapshot.permissions) || {};

  var canReadArticle = !!permissions.articleRead && boardOk;
  var canReadReplies = !!permissions.replyRead && boardOk;

  return {
    article: canReadArticle ? article : null,
    replies: canReadReplies ? listRepliesByArticle(spreadsheet, articleId) : []
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getArticleById: getArticleById,
    listRepliesByArticle: listRepliesByArticle,
    getArticleDetailForSnapshot_: getArticleDetailForSnapshot_
  };
}