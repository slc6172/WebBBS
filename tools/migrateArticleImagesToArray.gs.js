/**
 * ============================================================
 * 一次性手動執行工具：把 Articles 表舊版的 imageUrl1~3（三個獨立欄位）
 * 轉換成新版的 imageUrls（單一 JSON 陣列欄位）
 * ============================================================
 *
 * 背景：
 *   圖片張數突破輪（見 .scratch/gas-bbs-image-limit-desktop-ux/）把
 *   Articles 表的圖片欄位從固定 3 欄（J=imageUrl1, K=imageUrl2,
 *   L=imageUrl3）合併成單一欄（J=imageUrls，存 JSON 陣列字串），
 *   前後端程式碼（schema.js/postArticle.js/editArticle.js/
 *   deleteArticle.js/boardBulk.js/articleDetail.js/Code.js/
 *   Index.html）都已經改成只讀寫單一 J 欄。這支工具負責把既有文章的
 *   舊資料轉成新格式，這樣新程式碼部署上線後，舊文章的圖片才不會
 *   「憑空消失」。
 *
 * 使用方式：
 *   1. 在部署會讀寫新 imageUrls 欄位的程式碼**之前**，先把這個檔案貼進
 *      Apps Script 編輯器執行一次（連同 src/imageStorage.js 一起貼上，
 *      這支工具會用到裡面已經有自動化測試涵蓋的 compactImageUrls，
 *      不是另外重寫一份合併/去空白邏輯）
 *   2. 在函式下拉選單選擇 migrateArticleImagesToArray，按執行
 *   3. 執行完打開「執行項目」（左側選單的 Executions/執行記錄），查看
 *      Logger 印出的統計結果
 *   4. 確認統計結果無誤（轉換筆數符合預期、沒有異常）之後，才能部署
 *      本輪其餘的新程式碼——部署順序見 README.md「從既有部署升級：
 *      圖片欄位格式遷移」一節，順序反過來會導致新程式碼讀不到舊格式
 *      的圖片資料
 *   5. 確認結果沒問題後，這個檔案可以從 Apps Script 專案裡刪除
 *      （src/imageStorage.js 不用刪，是正式程式碼的一部分）
 *
 * 安全性：
 *   - 已經是新格式（J 欄的值可以被解析成 JSON 陣列）的列會被跳過，不會
 *     被重複處理或覆蓋，執行多次也不會壞資料（idempotent）
 *   - 完全沒有圖片的列（J/K/L 三欄都是空的）會被跳過、不寫入——讀取端
 *     （parseImageUrlsCell_，見 src/boardBulk.js 等）本來就把空字串當
 *     「沒有圖片」處理，不需要為了統一格式而多寫一次
 *   - 只改 J 欄（Articles 的第 10 欄），K、L 兩欄（原本的
 *     imageUrl2/imageUrl3）不會被清空或刪除，維持原樣當作備份，之後
 *     要不要在 Sheets 介面手動刪掉這兩欄，由你自己決定
 *   - 不動其他欄位或其他工作表
 */
function migrateArticleImagesToArray() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Articles');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Articles 表沒有資料，不用處理。');
    return;
  }

  var IMAGE_URL_1_COLUMN = 10; // J（遷移後這一欄變成 imageUrls；K=11, L=12 是舊的 imageUrl2/imageUrl3）
  var range = sheet.getRange(2, IMAGE_URL_1_COLUMN, lastRow - 1, 3); // 一次讀 J,K,L 三欄
  var values = range.getValues();

  var migratedCount = 0;
  var alreadyNewFormatCount = 0;
  var blankCount = 0;

  for (var i = 0; i < values.length; i++) {
    var rowNumber = i + 2;
    var imageUrl1 = values[i][0];
    var imageUrl2 = values[i][1];
    var imageUrl3 = values[i][2];

    if (isAlreadyImageUrlsJson_(imageUrl1)) {
      alreadyNewFormatCount++;
      continue;
    }

    var compacted = compactImageUrls([imageUrl1, imageUrl2, imageUrl3]);
    if (compacted.length === 0) {
      blankCount++;
      continue; // 完全沒有圖片，跳過、不寫入——讀取端本來就把空字串當成沒有圖片處理
    }

    sheet.getRange(rowNumber, IMAGE_URL_1_COLUMN, 1, 1).setValue(JSON.stringify(compacted));
    migratedCount++;
  }

  Logger.log('=== 圖片欄位格式轉換結果 ===');
  Logger.log('已轉換：' + migratedCount + ' 筆');
  Logger.log('已經是新格式，跳過：' + alreadyNewFormatCount + ' 筆');
  Logger.log('沒有圖片，跳過：' + blankCount + ' 筆');
}

/**
 * J 欄的值是不是已經是新格式（可以被解析成陣列的 JSON 字串）。用來判斷
 * 這一列該不該被跳過，讓整支工具可以重複執行而不會壞資料——邏輯跟
 * boardBulk.js/articleDetail.js 等讀取端的 parseImageUrlsCell_ 是同一個
 * 判斷方向（能解析成陣列才算數），只是這裡要的是「是不是」的布林值，
 * 不是解析結果本身，所以沒有直接共用同一支函式。
 * @param {*} value
 * @returns {boolean}
 */
function isAlreadyImageUrlsJson_(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    var parsed = JSON.parse(value);
    return Array.isArray(parsed);
  } catch (e) {
    return false;
  }
}
