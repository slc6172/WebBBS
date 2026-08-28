const { classifyLineMessage } = require('../src/lineMessageClassify');

test('classifyLineMessage keeps the full text for a text message', () => {
  const event = { message: { type: 'text', id: 'msg1', text: '晚上一起吃飯嗎？' } };

  const result = classifyLineMessage(event);

  expect(result).toEqual({ messageType: 'text', content: '晚上一起吃飯嗎？' });
});

test.each([
  ['sticker', '此處有一則貼圖'],
  ['video', '此處有一段影片'],
  ['audio', '此處有一段語音'],
  ['file', '此處有一個檔案'],
  ['location', '此處有一則位置分享']
])('classifyLineMessage turns a %s message into a fixed placeholder note, without keeping the original content', (type, expectedNote) => {
  const event = { message: { type: type, id: 'msg1' } };

  const result = classifyLineMessage(event);

  expect(result).toEqual({ messageType: type, content: expectedNote });
});

test('classifyLineMessage passes through an image message with its messageId, without downloading anything itself', () => {
  const event = { message: { type: 'image', id: 'msgImg1' } };

  const result = classifyLineMessage(event);

  expect(result).toEqual({ messageType: 'image', content: null, messageId: 'msgImg1' });
});

test('classifyLineMessage returns null for a message type it does not recognize, so callers can safely skip it', () => {
  const event = { message: { type: 'flex', id: 'msg1' } };

  const result = classifyLineMessage(event);

  expect(result).toBeNull();
});
