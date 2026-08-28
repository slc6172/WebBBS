/**
 * 依 LINE message.type 把一則訊息分類成暫存紀錄所需的形狀。
 * text 完整保留內容；sticker/video/audio/file/location 轉成固定文字註記，
 * 不保存原始內容；image 這裡只回傳型態與 messageId，實際下載交給呼叫端
 * （見 lineBotGlue.js 對圖片下載/上傳的處理）；無法辨識的型態回傳 null，
 * 呼叫端應該直接略過。
 * @param {{message: {type: string, id: string, text?: string}}} event
 * @returns {{messageType: string, content: (string|null), messageId?: string}|null}
 */
var PLACEHOLDER_NOTES = {
  sticker: '此處有一則貼圖',
  video: '此處有一段影片',
  audio: '此處有一段語音',
  file: '此處有一個檔案',
  location: '此處有一則位置分享'
};

function classifyLineMessage(event) {
  var message = event && event.message;
  if (!message) {
    return null;
  }

  if (message.type === 'text') {
    return { messageType: 'text', content: message.text };
  }

  if (message.type === 'image') {
    return { messageType: 'image', content: null, messageId: message.id };
  }

  if (PLACEHOLDER_NOTES.hasOwnProperty(message.type)) {
    return { messageType: message.type, content: PLACEHOLDER_NOTES[message.type] };
  }

  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyLineMessage: classifyLineMessage
  };
}
