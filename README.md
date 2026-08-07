# GAS BBS — Google Apps Script 論壇系統

## 結構

```
gas-bbs/
├── src/                      # 會被 clasp push 到 Apps Script 專案的檔案
│   ├── appsscript.json       # GAS 專案設定(時區、部署方式)
│   ├── schema.js             # ticket 01: ensureSchema(spreadsheet)(含強制時間欄位為純文字格式的修正)— 已測試
│   ├── ping.js                # ticket 01: pingRoundTrip(spreadsheet, value) — 已測試
│   ├── bootstrap.js          # ticket 01: parseBootstrapParams(e) — 已測試
│   ├── register.js           # ticket 02: validateUserId / validatePassword / hashPassword / registerUser — 已測試
│   ├── login.js               # ticket 03: verifyPassword / login — 已測試
│   ├── permissions.js         # ticket 04: getSessionRole / gateByRole — 已測試
│   ├── boards.js              # ticket 05: listBoards / getBoardsForRole — 已測試
│   ├── articles.js            # ticket 06: listArticlesByBoard / getArticlesForRole — 已測試
│   ├── postArticle.js         # ticket 07: validateArticleTitle / validateArticleContent / escapeFormulaInjection / createArticle / createArticleForRole — 已測試
│   ├── articleDetail.js       # ticket 08: getArticleById / listRepliesByArticle / getArticleDetailForRole — 已測試
│   ├── postReply.js           # ticket 09: createReply / createReplyForRole — 已測試
│   ├── editArticle.js         # ticket 10 + 12: editArticle(含 isAdmin) / editArticleForRole — 已測試
│   ├── deleteArticle.js       # ticket 11 + 12: deleteArticle(含 isAdmin) / deleteArticleForRole — 已測試
│   ├── deleteReply.js         # ticket 12: deleteReply / deleteReplyForRole(admin-only)— 已測試
│   ├── adminResetPassword.js  # ticket 14: resetPassword — 已測試(無 *ForRole 包裝,刻意設計)
│   ├── AdminTools.js          # ticket 14: resetUserPasswordManually — 僅供 Apps Script 編輯器手動執行,無自動化測試、無 google.script.run 入口
│   ├── Code.js                # doGet 入口(含 ticket 13 深連結解析)+ 所有 google.script.run 可呼叫的膠水函式
│   └── Index.html             # 前端 SPA(看板/文章/回覆/編輯/刪除/管理者功能全部在這一頁)
├── test/
│   ├── schema.test.js
│   ├── ping.test.js
│   ├── bootstrap.test.js
│   ├── validateUserId.test.js
│   ├── validatePassword.test.js
│   ├── hashPassword.test.js
│   ├── registerUser.test.js
│   ├── verifyPassword.test.js
│   ├── login.test.js
│   ├── getSessionRole.test.js
│   ├── gateByRole.test.js
│   ├── listBoards.test.js
│   ├── getBoardsForRole.test.js
│   ├── listArticlesByBoard.test.js
│   ├── getArticlesForRole.test.js
│   ├── validateArticleTitle.test.js
│   ├── validateArticleContent.test.js
│   ├── escapeFormulaInjection.test.js
│   ├── createArticle.test.js
│   ├── createArticleForRole.test.js
│   ├── getArticleById.test.js
│   ├── listRepliesByArticle.test.js
│   ├── getArticleDetailForRole.test.js
│   ├── createReply.test.js
│   ├── createReplyForRole.test.js
│   ├── editArticle.test.js
│   ├── editArticleForRole.test.js
│   ├── deleteArticle.test.js
│   ├── deleteArticleForRole.test.js
│   ├── deleteReply.test.js
│   ├── deleteReplyForRole.test.js
│   ├── resetPassword.test.js
│   └── doubles/
│       ├── fakeSpreadsheet.js       # SpreadsheetApp 的測試替身(system boundary mock)
│       ├── fakeLock.js              # LockService 的測試替身(system boundary mock)
│       └── fakeCache.js             # CacheService 的測試替身(system boundary mock)
├── vitest.config.js
├── package.json
└── MANUAL_VERIFICATION.md    # 部署後的手動驗收 checklist,依 ticket 01~14 分節(clasp 需要你自己的 Google 帳號)
```

## 執行自動化測試

```bash
npm install
npm test
```

32 個測試檔、98 個測試,全數通過。

**版本說明**:`src/` 目前以使用者提供的擴充版程式碼為準(不同於本文件其餘部分描述的原始 14-ticket 極簡 UI),疊加了 `editArticle.js`(原本遺失)與 `Code.js` 的 `logoutFromForm`(原本遺失)這兩個修正。`test/` 底下的自動化測試涵蓋的是後端 `src/*.js` 的核心邏輯,這部分在擴充版裡沒有改變行為(除了時間欄位改用單引號強制純文字),所以測試仍然有效;但 `Index.html` 本身已經是使用者擴充過的版面,跟本文件其他章節描述的極簡版 UI 不同,`MANUAL_VERIFICATION.md` 的部分文字描述(畫面顯示的確切文字)可能已經對不上。

## 部署到 Google

自動化測試只涵蓋不依賴 GAS 執行環境的純邏輯。`Code.js` / `Index.html` / `appsscript.json` 需要接到你自己的 Google 帳號與試算表才能驗證,步驟與驗收清單在 `MANUAL_VERIFICATION.md`。
