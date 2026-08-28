/**
 * 將已分類好的訊息陣列排版成文章內文：每則訊息一行、依時間排序、
 * 格式為「[HH:mm] 顯示名稱: 內容」。time 須已經是呼叫端擷取好的
 * "HH:mm" 字串（同一天內按字典序排序即可）；圖片連結／固定文字註記
 * 已經是 content 的一部分（由呼叫端組好），這裡只負責排序與排版，
 * 不判斷訊息型態。
 * @param {Array<{time: string, displayName: string, content: string}>} messages
 * @returns {string}
 */
function formatDigestContent(messages) {
  var sorted = (messages || []).slice().sort(function (a, b) {
    return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0);
  });

  return sorted
    .map(function (m) {
      return '[' + m.time + '] ' + m.displayName + ': ' + m.content;
    })
    .join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDigestContent: formatDigestContent
  };
}
