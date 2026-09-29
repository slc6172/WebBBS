const { incrementUserStat, incrementUserStatsBatch_ } = require('../src/userStats');
const { ensureSchema } = require('../src/schema');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');

function seedUserRow(sheet, overrides) {
  var defaults = {
    userId: 'alice01', passwordHash: 'h', salt: 's', role: 'user', createdAt: '2026/07/01 00:00:00',
    loginCount: 3, lastLoginAt: '2026/08/01 09:00:00', articleCount: 2, replyCount: 5
  };
  var u = Object.assign({}, defaults, overrides);
  sheet.appendRow([u.userId, u.passwordHash, u.salt, u.role, "'" + u.createdAt, u.loginCount, "'" + u.lastLoginAt, u.articleCount, u.replyCount]);
}

test('incrementUserStat adds a positive delta to the given user\'s articleCount', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'articleCount', 1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(3);
});

test('incrementUserStat applies a negative delta to replyCount', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', replyCount: 5 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'replyCount', -1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[8]).toBe(4);
});

test('incrementUserStat only touches the matching user\'s row, leaving others untouched', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });
  seedUserRow(ss.getSheetByName('Users'), { userId: 'bob02', articleCount: 9 });

  incrementUserStat(ss.getSheetByName('Users'), 'alice01', 'articleCount', 1);

  const rows = ss.getSheetByName('Users').getRange(2, 1, 2, 9).getValues();
  expect(rows[0][7]).toBe(3); // alice01
  expect(rows[1][7]).toBe(9); // bob02 untouched
});

test('incrementUserStat treats a blank/never-set cell as 0 before applying the delta', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  // appendRow with only 5 values leaves articleCount/replyCount blank, same as a
  // freshly-registered user who has never posted
  ss.getSheetByName('Users').appendRow(['carol03', 'h', 's', 'user', "'" + '2026/08/01 00:00:00']);

  incrementUserStat(ss.getSheetByName('Users'), 'carol03', 'articleCount', 1);

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(1);
});

test('incrementUserStat silently does nothing when the userId does not exist', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedUserRow(ss.getSheetByName('Users'), { userId: 'alice01', articleCount: 2 });

  expect(() => incrementUserStat(ss.getSheetByName('Users'), 'nobody', 'articleCount', 1)).not.toThrow();

  const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
  expect(row[7]).toBe(2); // alice01 unaffected
});

// mycr 第 15 輪票 13（見 F-14）：批次版本，一次套用「多個 userId 各自的
// delta」，不管有幾個 userId、加總要處理多少筆，固定只讀寫整欄各一次
// ——供 deleteArticle 刪除大量回覆時使用，取代逐則回覆各自呼叫一次
// incrementUserStat（那樣每次都要重新整欄掃描一次 userId）。
describe('incrementUserStatsBatch_', () => {
  test('applies each userId\'s own delta to the given stat column in one pass', () => {
    const ss = createFakeSpreadsheet();
    ensureSchema(ss);
    const users = ss.getSheetByName('Users');
    seedUserRow(users, { userId: 'alice01', replyCount: 5 });
    seedUserRow(users, { userId: 'bob02', replyCount: 2 });
    seedUserRow(users, { userId: 'carol03', replyCount: 0 });

    incrementUserStatsBatch_(users, 'replyCount', { alice01: -2, bob02: -1 });

    const rows = users.getRange(2, 1, 3, 9).getValues();
    const byId = {};
    rows.forEach((r) => { byId[r[0]] = r[8]; });
    expect(byId.alice01).toBe(3);
    expect(byId.bob02).toBe(1);
    expect(byId.carol03).toBe(0); // 沒有列在 deltas 裡，完全不受影響
  });

  test('treats a blank/never-set cell as 0 before applying the delta, same as the single-user version', () => {
    const ss = createFakeSpreadsheet();
    ensureSchema(ss);
    ss.getSheetByName('Users').appendRow(['dave04', 'h', 's', 'user', "'2026/08/01 00:00:00"]);

    incrementUserStatsBatch_(ss.getSheetByName('Users'), 'replyCount', { dave04: -1 });

    const row = ss.getSheetByName('Users').getRange(2, 1, 1, 9).getValues()[0];
    expect(row[8]).toBe(-1);
  });

  test('does nothing (and does not touch the sheet at all) when deltasByUserId is empty', () => {
    const ss = createFakeSpreadsheet();
    ensureSchema(ss);
    const users = ss.getSheetByName('Users');
    seedUserRow(users, { userId: 'alice01', replyCount: 5 });

    expect(() => incrementUserStatsBatch_(users, 'replyCount', {})).not.toThrow();

    const row = users.getRange(2, 1, 1, 9).getValues()[0];
    expect(row[8]).toBe(5);
  });

  test('SpreadsheetApp call count stays constant regardless of how many distinct userIds are in deltasByUserId', () => {
    const ss = createFakeSpreadsheet();
    ensureSchema(ss);
    const users = ss.getSheetByName('Users');
    const deltasFew = {};
    const deltasMany = {};
    for (let i = 0; i < 30; i++) {
      const id = 'user' + String(i).padStart(3, '0');
      seedUserRow(users, { userId: id, replyCount: 10 });
      if (i < 2) deltasFew[id] = -1;
      deltasMany[id] = -1;
    }

    function countCalls(fn) {
      let calls = 0;
      const spy = new Proxy(users, {
        get(target, prop) {
          const value = target[prop];
          if (typeof value !== 'function') return value;
          return (...args) => { calls++; return value.apply(target, args); };
        }
      });
      fn(spy);
      return calls;
    }

    const fewCalls = countCalls((spy) => incrementUserStatsBatch_(spy, 'replyCount', deltasFew));
    const manyCalls = countCalls((spy) => incrementUserStatsBatch_(spy, 'replyCount', deltasMany));

    expect(manyCalls).toBe(fewCalls); // 2 個 userId 或 30 個 userId，呼叫次數應該完全一樣
  });
});
