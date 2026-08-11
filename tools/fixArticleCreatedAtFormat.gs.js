/**
 * ============================================================
 * 一次性手動執行工具：修正外部匯入文章的 createdAt 時間格式
 * ============================================================
 *
 * 用途：
 *   外部匯入的文章 createdAt 可能長得像 "1996-03-05 3:01:50"（用 - 分隔，
 *   時分秒沒補零），跟本專案自己產生的 "2026/08/01 09:30:58"（用 / 分隔，
 *   時分秒都補零）格式不一致。因為文章列表排序是直接做字串比較，格式不
 *   一致會導致同一天內的文章排序出錯（詳見對話紀錄的說明）。
 *
 *   這支工具會掃過 Articles 表全部的 createdAt 欄位，把不是標準格式的
 *   值解析後改寫成標準格式，已經是標準格式的跳過不動。
 *
 * 使用方式：
 *   1. 把這個檔案、以及 src/timestampNormalizer.js 都貼進 Apps Script 編輯器
 *      （timestampNormalizer.js 提供這裡用到的 isCanonicalTimestamp /
 *      parseLooseTimestamp / formatCanonicalTimestamp 三個函式，是本專案
 *      自動化測試涵蓋、已經驗證過的邏輯，不是這裡另外重寫一份）
 *   2. 在 Apps Script 編輯器上方的函式下拉選單選擇 fixArticleCreatedAtFormat，
 *      按執行
 *   3. 執行完打開「執行項目」（左側選單的 Executions/執行記錄），查看
 *      Logger 印出的統計結果跟需要人工檢查的清單（如果有的話）
 *   4. 確認結果沒問題後，這個檔案可以從 Apps Script 專案裡刪除（其他檔案，
 *      包括 timestampNormalizer.js，不用刪，是正式程式碼的一部分）
 *
 * 安全性：
 *   - 已經是標準格式的列不會被改動，執行多次也不會壞資料（idempotent）
 *   - 解析不出來的值不會被硬改，會列在 Logger 輸出裡讓你自己決定怎麼處理
 *   - 只改 Articles 表的 createdAt 欄位（F 欄），不動其他欄位或其他表
 */
function fixArticleCreatedAtFormat() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Articles');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Articles 表沒有資料，不用處理。');
    return;
  }

  var CREATED_AT_COLUMN = 6; // A=articleId B=boardId C=title D=author E=content F=createdAt
  var range = sheet.getRange(2, CREATED_AT_COLUMN, lastRow - 1, 1);
  var values = range.getValues();

  var fixedCount = 0;
  var alreadyOkCount = 0;
  var skippedBlankCount = 0;
  var unparseableRows = [];

  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    var rowNumber = i + 2;

    if (raw === '' || raw === null) {
      skippedBlankCount++;
      continue;
    }

    if (isCanonicalTimestamp(raw)) {
      alreadyOkCount++;
      continue;
    }

    var parsed = parseLooseTimestamp(raw);
    if (!parsed) {
      unparseableRows.push('第 ' + rowNumber + ' 列（原始值：' + raw + '）');
      continue;
    }

    var fixed = formatCanonicalTimestamp(parsed);
    // 強制純文字，跟專案裡其他寫入時間戳記的地方（register.js/postArticle.js 等）同一招，
    // 避免 Sheets 又把改好的字串自動轉成 Date 物件
    sheet.getRange(rowNumber, CREATED_AT_COLUMN, 1, 1).setValue("'" + fixed);
    fixedCount++;
  }

  Logger.log('=== createdAt 格式修正結果 ===');
  Logger.log('已修正：' + fixedCount + ' 筆');
  Logger.log('本來就正確，跳過：' + alreadyOkCount + ' 筆');
  Logger.log('空白，跳過：' + skippedBlankCount + ' 筆');
  Logger.log('無法解析，需要人工檢查：' + unparseableRows.length + ' 筆');
  if (unparseableRows.length > 0) {
    Logger.log(unparseableRows.join('\n'));
  }
}
