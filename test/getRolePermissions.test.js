const { getRolePermissions } = require('../src/permissions');
const { createFakeSpreadsheet } = require('./doubles/fakeSpreadsheet');
const { ensureSchema } = require('../src/schema');

function seedPermissionRow(ss, row) {
  ss.getSheetByName('Permission').appendRow(row);
}

test('getRolePermissions returns the 8 permission booleans for a role that exists in the Permission sheet', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss); // seeds newbie/user/admin defaults

  expect(getRolePermissions(ss, 'user')).toEqual({
    articleRead: true,
    articlePost: true,
    articleManageOwn: true,
    replyRead: true,
    replyPost: true,
    replyDeleteOwn: true,
    leaderboard: true,
    login: true
  });

  expect(getRolePermissions(ss, 'newbie')).toEqual({
    articleRead: false,
    articlePost: false,
    articleManageOwn: false,
    replyRead: false,
    replyPost: false,
    replyDeleteOwn: false,
    leaderboard: false,
    login: true
  });
});

test('getRolePermissions returns every permission as false when the role does not exist in the Permission sheet (e.g. a typo, or a role that was removed)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(getRolePermissions(ss, 'not-a-real-role')).toEqual({
    articleRead: false,
    articlePost: false,
    articleManageOwn: false,
    replyRead: false,
    replyPost: false,
    replyDeleteOwn: false,
    leaderboard: false,
    login: false
  });
});

test('getRolePermissions returns every permission as false when role is null or undefined (e.g. not logged in)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  const allFalse = {
    articleRead: false,
    articlePost: false,
    articleManageOwn: false,
    replyRead: false,
    replyPost: false,
    replyDeleteOwn: false,
    leaderboard: false,
    login: false
  };

  expect(getRolePermissions(ss, null)).toEqual(allFalse);
  expect(getRolePermissions(ss, undefined)).toEqual(allFalse);
});

test('getRolePermissions reflects an admin\'s manual edit immediately (always re-reads the sheet, never caches)', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);

  expect(getRolePermissions(ss, 'user').replyDeleteOwn).toBe(true);

  // Simulate an admin turning this off directly in Google Sheets.
  ss.getSheetByName('Permission').getRange(3, 1, 1, 9).setValues([
    ['user', true, true, true, true, true, false, true, true]
  ]);

  expect(getRolePermissions(ss, 'user').replyDeleteOwn).toBe(false);
});

test('getRolePermissions picks up a brand-new custom role an admin added directly to the sheet (e.g. a future "reject" role), with no code changes', () => {
  const ss = createFakeSpreadsheet();
  ensureSchema(ss);
  seedPermissionRow(ss, ['reject', false, false, false, false, false, false, false, false]);

  expect(getRolePermissions(ss, 'reject')).toEqual({
    articleRead: false,
    articlePost: false,
    articleManageOwn: false,
    replyRead: false,
    replyPost: false,
    replyDeleteOwn: false,
    leaderboard: false,
    login: false
  });
});
