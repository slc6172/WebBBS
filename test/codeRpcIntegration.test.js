// mycr 第 15 輪票 01：Code.js RPC 整合測試骨架。
//
// Code.js 依專案慣例（見 README「單元測試 vs 手動驗收」一節）沒有自動化
// 測試，靠 MANUAL_VERIFICATION.md 在真實 GAS 環境人工驗收。這支測試不
// 取代那份清單——真實 GAS 的樣板編譯、實際延遲、真正的 Drive/Sheets
// 行為仍然只能部署後人工驗收——而是補上「RPC 邏輯本身對不對」這一層，
// 讓後續票（08/09/10/11）能對 Code.js 的修改跑紅燈／綠燈流程，不是憑
// 肉眼檢查程式碼。
//
// 這個檔案分兩部分：
//   1. 對 8 個目前完全沒有自動化測試的 RPC 進入點做特徵化測試
//      （characterization test）——先鎖住「目前」的行為，後續票要改行為
//      時，會在對應票裡把這裡的斷言改成新行為（不是刪掉了事，見 README
//      「/tdd 的紅綠燈流程...要老實更新斷言」那條既有原則）。
//   2. 跨檔案同名頂層函式偵測——純靜態分析，不需要 GAS 服務替身，抓的
//      是 mycr 掃描報告 F-10（見票 06）那類問題本身。

const { createGasGlobalContext, listSrcFiles } = require('./doubles/gasGlobalContext');
const fs = require('fs');
const path = require('path');

function seedBaseline(g) {
  g.ctx.ensureSchema(g.ss, null);
  g.ss.getSheetByName('Boards').appendRow(['general', 'General', '', 1, '', '', 'ALL']);
  return g;
}

function registerAndLogin(g, userId, password, role) {
  // register.js 的全站註冊節流（每 5 分鐘限 1 次、每小時限 10 次，鍵是
  // 固定字串,不分帳號——這是刻意的設計取捨,見該檔案開頭註解）會讓同一個
  // 測試裡「連續註冊第二個使用者」直接被擋下來、registerUserFromForm
  // 靜默回傳 success:false。整合測試常常需要一次準備好幾個使用者（作者
  // /被提及者/不同角色的檢視者），這裡的節流不是這幾張票要測的行為
  // （既有 register.js 自己的測試已經覆蓋節流邏輯本身），所以每次呼叫
  // 前先清掉節流計數，讓測試能自由建立多個帳號，等同於「每個註冊間隔
  // 都超過 5 分鐘」的情境。
  g.cache.remove('registerCount5Min');
  g.cache.remove('registerCount1Hour');

  // register.js：新註冊一律是 'newbie' 角色（Permission 表的 newbie
  // 預設全部權限為 false，只有 login=true）——測試裡要模擬「管理員已經
  // 審核過、正常在用的帳號」，一律要手動推進角色，不能假設預設角色就有
  // 任何操作權限。
  const registered = g.ctx.registerUserFromForm(userId, password);
  if (!registered.success) {
    throw new Error('registerAndLogin 測試輔助函式：registerUserFromForm(' + userId + ') 失敗 — ' + JSON.stringify(registered));
  }
  const targetRole = role || 'user';
  const users = g.ss.getSheetByName('Users');
  for (let r = 2; r <= users.getLastRow(); r++) {
    if (users.getRange(r, 1, 1, 1).getValues()[0][0] === userId) {
      users.getRange(r, 4, 1, 1).setValues([[targetRole]]);
      break;
    }
  }
  const login = g.ctx.loginFromForm(userId, password);
  if (!login.success) {
    throw new Error('registerAndLogin 測試輔助函式：loginFromForm(' + userId + ') 失敗 — ' + JSON.stringify(login));
  }
  g.ctx.getMyStatus(login.token); // 建立 session snapshot，批量/單篇讀取端點都要靠它
  return login.token;
}

describe('Code.js RPC — 既有行為特徵化測試（票 01 baseline）', () => {
  test('getMyStatus：合法 token 回傳角色與權限', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'alice0001', 'correct-horse-battery-staple');
    const status = JSON.parse(g.ctx.getMyStatus(token));
    expect(status.role).toBe('user');
    expect(status.userId).toBe('alice0001');
    expect(status.permissions.articleRead).toBe(true);
  });

  test('getBoardsFromToken：合法 token 回傳看板清單', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'alice0002', 'correct-horse-battery-staple');
    const boards = JSON.parse(g.ctx.getBoardsFromToken(token));
    expect(Array.isArray(boards)).toBe(true);
    expect(boards.some((b) => b.boardId === 'general')).toBe(true);
  });

  test('getBoardBulkFromToken：沒有任何寫入發生時，版本戳沿用既有值，不會每次重讀都重新產生（票 08）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const authorToken = registerAndLogin(g, 'author003', 'correct-horse-battery-staple');
    g.ctx.postArticleFromForm(authorToken, 'general', '標題', '內文', []);

    const first = JSON.parse(g.ctx.getBoardBulkFromToken(authorToken, 'general', 0, '', ''));
    // 第二位使用者不帶 clientVersion 重新進入（模擬「換一個人第一次載入」），
    // 期間完全沒有任何寫入發生
    const readerToken = registerAndLogin(g, 'reader002', 'correct-horse-battery-staple');
    const second = JSON.parse(g.ctx.getBoardBulkFromToken(readerToken, 'general', 0, '', ''));

    expect(second.version).toBe(first.version); // 版本戳應該沿用，不是每次重讀都重新產生
  });

  test('getBoardBulkFromToken：replyRead=false 的角色看不到回覆內容，留言數字仍正常回傳（票 09）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const authorToken = registerAndLogin(g, 'author001', 'correct-horse-battery-staple');
    g.ctx.postArticleFromForm(authorToken, 'general', '標題', '內文', []);
    const articleId = g.ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0];
    g.ctx.postReplyFromForm(authorToken, articleId, '一則回覆');

    // 建立一個 replyRead=false 的自訂角色
    g.ss.getSheetByName('Permission').appendRow(['viewer', true, false, false, false, false, false, false, true]);
    const viewerToken = registerAndLogin(g, 'viewer001', 'correct-horse-battery-staple', 'viewer');
    const bulk = JSON.parse(g.ctx.getBoardBulkFromToken(viewerToken, 'general', 0, '', ''));
    expect(bulk.articles.length).toBe(1);
    expect(bulk.articles[0].replyCount).toBe(1); // 留言數字不受影響，未讀徽章依賴它
    expect(bulk.repliesByArticleId[articleId] || []).toEqual([]); // 回覆內容本身不再回傳

    // replyRead=true 的一般角色行為不變
    const normalToken = registerAndLogin(g, 'normal001', 'correct-horse-battery-staple');
    const bulkNormal = JSON.parse(g.ctx.getBoardBulkFromToken(normalToken, 'general', 0, '', ''));
    expect(bulkNormal.repliesByArticleId[articleId].length).toBe(1);
  });

  test('getArticleDetailFromToken：replyRead=false 的角色看不到回覆內容（既有行為，單篇端點已正確）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const authorToken = registerAndLogin(g, 'author002', 'correct-horse-battery-staple');
    g.ctx.postArticleFromForm(authorToken, 'general', '標題2', '內文2', []);
    const articleId = g.ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0];
    g.ctx.postReplyFromForm(authorToken, articleId, '一則回覆2');

    g.ss.getSheetByName('Permission').appendRow(['viewer2', true, false, false, false, false, false, false, true]);
    const viewerToken = registerAndLogin(g, 'viewer002', 'correct-horse-battery-staple', 'viewer2');
    const detail = JSON.parse(g.ctx.getArticleDetailFromToken(viewerToken, articleId, ''));
    expect(detail.replies).toEqual([]);
  });

  test('markBoardSeenFromToken：只接受 snapshot 裡 allowedBoardIds 允許的看板 ID，任意字串被拒絕（票 10）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'alice0003', 'correct-horse-battery-staple');

    expect(() => g.ctx.markBoardSeenFromToken(token, 'this-board-does-not-exist')).not.toThrow();
    const users = g.ss.getSheetByName('Users');
    const afterInvalid = users.getRange(2, 10, 1, 1).getValues()[0][0];
    expect(String(afterInvalid || '')).not.toContain('this-board-does-not-exist'); // 不合法看板 ID 不會被寫入

    expect(() => g.ctx.markBoardSeenFromToken(token, 'general')).not.toThrow(); // 正常看板 ID 行為不變
    const afterValid = users.getRange(2, 10, 1, 1).getValues()[0][0];
    expect(String(afterValid)).toContain('general');
  });

  test('postArticleFromForm：合法 token 可以成功發文', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'poster001', 'correct-horse-battery-staple');
    const res = g.ctx.postArticleFromForm(token, 'general', '測試標題', '測試內文', []);
    expect(res.success).toBe(true);
    expect(g.ss.getSheetByName('Articles').getLastRow()).toBe(2);
  });

  test('postReplyFromForm：合法 token 可以成功回覆', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'poster002', 'correct-horse-battery-staple');
    g.ctx.postArticleFromForm(token, 'general', '標題', '內文', []);
    const articleId = g.ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0];
    const res = g.ctx.postReplyFromForm(token, articleId, '回覆內容');
    expect(res.success).toBe(true);
  });

  test('editArticleFromForm：作者本人可以編輯自己的文章', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'editor001', 'correct-horse-battery-staple');
    g.ctx.postArticleFromForm(token, 'general', '原標題', '原內文', []);
    const articleId = g.ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0];
    const res = g.ctx.editArticleFromForm(token, articleId, '新標題', '新內文', []);
    expect(res.success).toBe(true);
  });

  test('三個讀取端點在密碼被重設、或使用者登出後，都會視為未登入（票 11）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'reader001', 'correct-horse-battery-staple');

    // 密碼重設：透過真正的 resetPassword_（跟 adminResetPassword.js 的 RPC 同一份邏輯），
    // 確認 credentialVersion 欄位跟撤銷標記都正確被 Code.js 串起來。
    const digestFn = (s) => g.ctx.Utilities.computeDigest('SHA_256', s);
    g.ctx.resetPassword_(g.ss, g.cache, digestFn, 'reader001', 'brand-new-safe-password', 'new-salt-value', 'admin01', '2026/09/24 11:00:00', 'credential-v2');

    expect(g.ctx.getBoardsFromToken(token)).toBe('[]');
    expect(JSON.parse(g.ctx.getBoardBulkFromToken(token, 'general', 0, '', '')).articles).toEqual([]);
    const detail = JSON.parse(g.ctx.getArticleDetailFromToken(token, 'nonexistent-but-token-is-what-matters', ''));
    expect(detail.article).toBeNull();

    // 登出：另一個獨立的 token，一樣的三個端點，這次靠 logoutFromForm 觸發
    const token2 = registerAndLogin(g, 'reader003', 'correct-horse-battery-staple');
    expect(JSON.parse(g.ctx.getBoardsFromToken(token2)).length).toBeGreaterThan(0); // 登出前行為正常
    g.ctx.logoutFromForm(token2);
    expect(g.ctx.getBoardsFromToken(token2)).toBe('[]');
  });

  test('isSessionValidFor_ 本身不管被呼叫幾次都不會碰 SpreadsheetApp（票 11：讀取端點的撤銷檢查全程只靠快取）', () => {
    const g = seedBaseline(createGasGlobalContext());
    const token = registerAndLogin(g, 'reader004', 'correct-horse-battery-staple');

    let getSheetByNameCalls = 0;
    const originalGetSheetByName = g.ss.getSheetByName.bind(g.ss);
    g.ss.getSheetByName = (name) => { getSheetByNameCalls++; return originalGetSheetByName(name); };

    for (let i = 0; i < 5; i++) {
      g.ctx.isSessionValidFor_(g.cache, token);
    }
    expect(getSheetByNameCalls).toBe(0);

    const boards = JSON.parse(g.ctx.getBoardsFromToken(token));
    expect(boards.length).toBeGreaterThan(0); // 正常情境下行為不變
  });
});

describe('跨檔案同名頂層函式偵測（靜態分析，票 06 的驗證手段）', () => {
  test('src/*.js 裡沒有內容互相衝突的同名頂層函式', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const files = listSrcFiles();
    const defs = {}; // name -> [{file, normalizedBody}]

    files.forEach((f) => {
      const source = fs.readFileSync(path.join(srcDir, f), 'utf8');
      const re = /^function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/gm;
      let m;
      while ((m = re.exec(source)) !== null) {
        const start = m.index;
        const endIdx = source.indexOf('\n}\n', start);
        const body = source.slice(start, endIdx === -1 ? source.length : endIdx + 3);
        // 「xxxFor_」這種 delegate wrapper（見 formulaInjection.js/
        // login.js/adminResetPassword.js 等檔案開頭的循環 require 說明）
        // 刻意在每個檔案各自定義一份，差別只在指向哪一個 require() 進來
        // 的本地模組變數（例如 `_register` vs `_registerModule`）——這個
        // 變數在 GAS 的共用全域環境下永遠是 falsy（沒有 require()），
        // 三元運算式一律 fall back 呼叫同一個真正的全域函式，所以這類
        // 差異在 GAS 執行期是無害的，比較時要先把這種「本地模組參照變數
        // 命名」正規化掉，只留下空白正規化後的內容，才不會把它們誤判成
        // 分歧。這個正規化刻意只吃開頭底線的識別字（`_xxxModule` 這種
        // 命名慣例），不動其他任何識別字——真正呼叫到不同全域函式名稱
        // （例如打錯字）或邏輯結構不同（例如 mentions.js 自己完整重新
        // 實作、不走 delegate 的那份 escapeFormulaInjectionFor_），
        // 正規化後仍然會被抓出來。
        const normalized = body
          .replace(/\s+/g, ' ')
          .replace(/\b_[A-Za-z][A-Za-z0-9]*\b/g, '_MODULE_REF_');
        (defs[m[1]] = defs[m[1]] || []).push({ file: f, body: normalized });
      }
    });

    const divergent = [];
    Object.keys(defs).forEach((name) => {
      const list = defs[name];
      if (list.length > 1) {
        const distinctBodies = new Set(list.map((x) => x.body));
        if (distinctBodies.size > 1) {
          divergent.push(name + ' -> ' + list.map((x) => x.file).join(', '));
        }
      }
    });

    // 已知、已記錄的例外（round-14 交接文件「尚未處理」清單）：mentions.js
    // 的 escapeFormulaInjectionFor_ 是獨立的本地重新實作（舊的「只在開頭
    // 是特定符號時才加前綴」邏輯），不是像其餘 5 個檔案那樣委派到
    // formulaInjection.js 的共用實作——這是刻意留著、標記為「非義務的
    // 整潔度改善」的既有狀態，不是這張票的範圍。票 05 會統一這一份，
    // 屆時這裡的允許清單就可以直接刪掉這一行（若刪掉後測試又抓到別的
    // 東西，才代表真的有新的分歧出現）。
    const knownAcceptedDivergences = [];
    // mycr 第 15 輪票 05（統一 mentions.js 依賴 formulaInjection.js）跟
    // 票 06（deleteReply.js 的 findArticleInfoForReply_ 改名成
    // findArticleInfoForDeleteReply_）完成後，這份清單已經清空——如果
    // 之後又有人不小心在某個檔案加回一份跟其他檔案內容不同的同名頂層
    // 函式，這個測試會抓到，不需要先查是不是又要加進允許清單。
    const unexpected = divergent.filter((d) => knownAcceptedDivergences.indexOf(d) === -1);

    expect(unexpected).toEqual([]);
  });

  test('不同載入順序下，findArticleInfoForReply_ 的行為一致（票 06 已改名 deleteReply.js 那份為 findArticleInfoForDeleteReply_，這裡應該恢復成正常綠燈測試，不再是 test.fails()）', () => {
    const alphabetical = listSrcFiles();
    const reversed = alphabetical.slice().reverse();

    function replyMentionKeys(order) {
      const g = seedBaseline(createGasGlobalContext({ order: order }));
      const authorToken = registerAndLogin(g, 'author999', 'correct-horse-battery-staple');
      g.ctx.postArticleFromForm(authorToken, 'general', '順序測試標題', '內文', []);
      const articleId = g.ss.getSheetByName('Articles').getRange(2, 1, 1, 1).getValues()[0][0];
      registerAndLogin(g, 'victim999', 'correct-horse-battery-staple');
      g.ctx.postReplyFromForm(authorToken, articleId, '嗨 @victim999');
      const users = g.ss.getSheetByName('Users');
      for (let r = 2; r <= users.getLastRow(); r++) {
        if (users.getRange(r, 1, 1, 1).getValues()[0][0] === 'victim999') {
          const pending = JSON.parse(users.getRange(r, 11, 1, 1).getValues()[0][0] || '[]');
          return pending.length > 0 ? Object.keys(pending[0]).sort() : [];
        }
      }
      return [];
    }

    expect(replyMentionKeys(alphabetical)).toEqual(replyMentionKeys(reversed));
  });
});
