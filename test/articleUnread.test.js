const { computeArticleUnreadFlags_ } = require('../src/articleUnread');

test('an empty lastSeenAt (never visited this board before) marks every article as not new and without new replies', () => {
  const articles = [
    { articleId: 'a1', createdAt: '2026/08/20 10:00:00' },
    { articleId: 'a2', createdAt: '2026/08/25 10:00:00' }
  ];
  const repliesByArticleId = {
    a1: [{ replyId: 'r1', createdAt: '2026/08/26 09:00:00' }]
  };

  const result = computeArticleUnreadFlags_(articles, repliesByArticleId, '');

  expect(result.map(a => ({ articleId: a.articleId, isNew: a.isNew, hasNewReply: a.hasNewReply }))).toEqual([
    { articleId: 'a1', isNew: false, hasNewReply: false },
    { articleId: 'a2', isNew: false, hasNewReply: false }
  ]);
});

test('an article created after lastSeenAt is marked as new', () => {
  const articles = [
    { articleId: 'a1', createdAt: '2026/08/20 10:00:00' }
  ];

  const result = computeArticleUnreadFlags_(articles, {}, '2026/08/22 00:00:00');

  expect(result[0].isNew).toBe(false);

  const result2 = computeArticleUnreadFlags_(articles, {}, '2026/08/19 00:00:00');
  expect(result2[0].isNew).toBe(true);
  expect(result2[0].hasNewReply).toBe(false);
});

test('an already-read article (not new) is flagged hasNewReply when one of its replies is newer than lastSeenAt', () => {
  const articles = [{ articleId: 'a1', createdAt: '2026/08/10 10:00:00' }];
  const repliesByArticleId = {
    a1: [
      { replyId: 'r1', createdAt: '2026/08/11 09:00:00' },
      { replyId: 'r2', createdAt: '2026/08/23 09:00:00' }
    ]
  };

  const result = computeArticleUnreadFlags_(articles, repliesByArticleId, '2026/08/20 00:00:00');

  expect(result[0].isNew).toBe(false);
  expect(result[0].hasNewReply).toBe(true);
});

test('an already-read article with no replies newer than lastSeenAt is not flagged hasNewReply', () => {
  const articles = [{ articleId: 'a1', createdAt: '2026/08/10 10:00:00' }];
  const repliesByArticleId = {
    a1: [{ replyId: 'r1', createdAt: '2026/08/11 09:00:00' }]
  };

  const result = computeArticleUnreadFlags_(articles, repliesByArticleId, '2026/08/20 00:00:00');

  expect(result[0].hasNewReply).toBe(false);
});

test('an article created at exactly lastSeenAt is not new (strictly-after, not on-or-after)', () => {
  const articles = [{ articleId: 'a1', createdAt: '2026/08/20 00:00:00' }];

  const result = computeArticleUnreadFlags_(articles, {}, '2026/08/20 00:00:00');

  expect(result[0].isNew).toBe(false);
});

test('an article with no entry in repliesByArticleId at all is handled safely (treated as zero replies)', () => {
  const articles = [{ articleId: 'a1', createdAt: '2026/08/10 10:00:00' }];

  const result = computeArticleUnreadFlags_(articles, {}, '2026/08/20 00:00:00');

  expect(result[0].hasNewReply).toBe(false);
});

test('multiple articles are evaluated independently', () => {
  const articles = [
    { articleId: 'a1', createdAt: '2026/08/25 10:00:00' }, // new
    { articleId: 'a2', createdAt: '2026/08/10 10:00:00' }  // already read, no new replies
  ];
  const repliesByArticleId = {
    a2: [{ replyId: 'r1', createdAt: '2026/08/05 09:00:00' }]
  };

  const result = computeArticleUnreadFlags_(articles, repliesByArticleId, '2026/08/20 00:00:00');

  expect(result.find(a => a.articleId === 'a1')).toMatchObject({ isNew: true, hasNewReply: false });
  expect(result.find(a => a.articleId === 'a2')).toMatchObject({ isNew: false, hasNewReply: false });
});

test('does not mutate the original articles array or its elements', () => {
  const articles = [{ articleId: 'a1', createdAt: '2026/08/25 10:00:00' }];
  const originalCopy = JSON.parse(JSON.stringify(articles));

  computeArticleUnreadFlags_(articles, {}, '2026/08/20 00:00:00');

  expect(articles).toEqual(originalCopy);
});
