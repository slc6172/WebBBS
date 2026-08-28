const { formatDigestContent } = require('../src/lineArticleContent');

test('formatDigestContent sorts messages by time and formats each as [HH:mm] displayName: content', () => {
  const messages = [
    { time: '12:30', displayName: 'Bob', content: '好啊' },
    { time: '12:00', displayName: 'Alice', content: '晚上一起吃飯嗎？' }
  ];

  const result = formatDigestContent(messages);

  expect(result).toBe('[12:00] Alice: 晚上一起吃飯嗎？\n[12:30] Bob: 好啊');
});
