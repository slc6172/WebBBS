# GAS BBS

一個完全建構在 **Google Apps Script + Google Sheets** 上的電子佈告欄（BBS）系統。不需要另外租用伺服器或資料庫，部署後就是一組 Web App 網址，資料全部存在你自己的 Google 試算表裡。

## 特色

- 帳號註冊 / 登入，session token 管理，密碼錯誤鎖定機制
- **可自訂的角色權限系統**：角色種類與權限（讀取、發表、編輯刪除本人等 8 項）都定義在 `Permission` 工作表裡，透過 Google Sheets 直接調整，不需要改程式碼或重新部署
- 看板層級的存取限制（`Boards.AllowRoles`），可以讓特定看板只對特定角色開放
- 多看板、文章、回覆，圖片上傳（存 Google Drive，單篇文章最多 99 張，單張上限 5MB；選很多張或選很大的圖時，前端會自動依大小切成多個批次依序上傳，不用自己手動減少張數重試，除了點檔案選取，也支援拖曳檔案與剪貼簿直接貼上）；文章詳情頁以縮圖網格呈現，點擊開燈箱放大瀏覽，桌面版燈箱內可用左右鍵切換上一張/下一張圖片
- **桌面鍵盤快捷鍵**（僅桌面雙欄版面）：`↑`/`↓` 切換上一篇（較新）/下一篇（較舊）文章、`Ctrl+K` 開啟發文表單、`Esc` 關閉彈窗或燈箱、`←`/`→` 切換文章列表頁次（燈箱開啟時改為切換圖片），焦點在輸入框打字時不會誤觸發
- **手機版文章導覽**：文章詳情頁上方有「上一篇/下一篇」固定按鈕，另外支援左右滑動手勢切換（往左滑＝下一篇、往右滑＝上一篇），已無上一篇/下一篇時按鈕呈 disabled 狀態；螢幕最左緣往右滑動會保留給瀏覽器原本的返回手勢，不會互相衝突
- 響應式版面（手機單畫面導覽 / 桌面雙欄）
- **效能優化**：角色/權限查驗改用 session 快照快取（每次頁面載入查一次，同一次瀏覽期間切看板/開文章不重查）；進入看板時整批預載文章（含內文/圖片）與回覆，點開任一篇文章不再需要等待伺服器回應；文章數超過批次上限時提供「載入更早的文章」與直接跳頁兩種瀏覽方式；以版本戳比對決定要不要重新整表讀取，減少不必要的 Sheets API 呼叫（見下方「開發」一節的工程原則）
- 看板新內容提示（未讀文章/回覆徽章）
- 登入次數、發文數、回覆數排行榜
- 文章編輯紀錄顯示
- 分享文章連結：手機上優先用系統原生分享面板（可以直接分享到 LINE 對話或 Keep），另外還有一顆「💬 LINE」獨立按鈕（LINE 的分享 URL scheme 只有手機作業系統才有效，這顆按鈕只在偵測到 iOS / Android 時才會出現）；桌面版與其他不支援原生分享的環境，一律用「🔗 分享」按鈕退回複製連結
- **LINE 群組對話紀錄機器人**：把授權的 LINE 群組對話自動彙整成看板文章（依圖片數/字數門檻分段，每日固定時間收尾），讓沒有即時在線的成員也能事後在看板上回顧群組動態；發話人顯示名稱透過 `LineUserId` 工作表手動對應成真實姓名

## 架構

- **前端**：單一 `Index.html`，透過 `HtmlService` 提供的 SPA，所有前後端溝通都走 `google.script.run`。前端邏輯沒有自動化測試（GAS 環境下瀏覽器端程式碼無法像後端一樣同時被 Node 測試與 GAS 執行共用同一份原始碼），行為以手動驗收清單把關。
- **後端有兩個進入點**：`Code.js` 是網站的 `doGet` / glue 層，負責讀 session、呼叫下方各個邏輯模組、決定要不要包成 `JSON.stringify`；`lineBotGlue.js` 是 LINE Messaging API 的 `doPost` / glue 層，處理群組訊息接收與彙整發文，跟 `Code.js` 是完全獨立的入口，各自維護。其餘 `src/*.js` 各自是獨立的邏輯模組（文章、回覆、看板、權限、圖片……），彼此透過檔案內的小型 wrapper 互相呼叫。
- **資料庫**：Google 試算表，8 張工作表：

  | 工作表 | 用途 |
  |---|---|
  | `Users` | 帳號、密碼雜湊、角色、登入/發文/回覆統計 |
  | `Boards` | 看板清單、看板活動時間戳、`AllowRoles` |
  | `Articles` | 文章內容、圖片連結、編輯紀錄 |
  | `Replies` | 回覆內容 |
  | `Permission` | 角色清單與每個角色的 8 項權限 |
  | `LineGroupBoards` | LINE 群組白名單、群組對看板的對應關係（管理者手動維護） |
  | `LineStaging` | LINE 對話彙整前的暫存區，成功張貼成文章後即清空 |
  | `LineUserId` | LINE `userId` → 顯示名稱的對應表（管理者手動維護，見下方說明） |

### 雙環境相容寫法

每個 `src/*.js` 檔案在 Node（跑單元測試時）用 `require` 互相引用，在真正的 Apps Script 執行環境裡則是靠**全域命名空間**互相呼叫（GAS 會把專案裡所有檔案攤平成同一個全域作用域，沒有模組系統）。因此每個檔案開頭常會看到類似這樣的寫法：

```js
var _permissionsModule = (typeof require !== 'undefined') ? require('./permissions') : null;

function getRolePermissionsFor_(spreadsheet, role) {
  return (_permissionsModule ? _permissionsModule.getRolePermissions : getRolePermissions)(spreadsheet, role);
}
```

`typeof require !== 'undefined'` 在 Node 底下是 true、在 GAS 執行環境是 false（GAS 沒有 `require`），同一份原始碼因此兩邊都能跑，不需要維護兩份。

## 專案結構

```
gas-bbs/
├── src/                      # 部署到 Apps Script 的原始碼（每個檔案對應一支 GAS 指令碼）
│   ├── Code.js                #   doGet 入口與所有 google.script.run 的膠水層
│   ├── Index.html              #   前端 SPA
│   ├── appsscript.json         #   GAS 專案設定（時區、執行身份、存取權限）
│   ├── schema.js               #   工作表結構定義、ensureSchema（含 Permission 表 seed 保護）
│   ├── permissions.js          #   角色查詢、權限查詢
│   ├── boards.js / articles.js / articleDetail.js
│   ├── boardBulk.js            #   看板批量預載（進板一次整批讀完，效能優化 ticket 04/05）
│   ├── postArticle.js / editArticle.js / deleteArticle.js
│   ├── postReply.js / deleteReply.js
│   ├── login.js / register.js / adminResetPassword.js
│   ├── leaderboard.js / userStats.js / boardActivity.js
│   ├── imageStorage.js         #   圖片上傳存 Google Drive
│   ├── contentVersion.js       #   版本戳差異化更新
│   ├── timestampNormalizer.js  #   舊資料時間格式正規化
│   ├── bootstrap.js / ping.js  #   環境自我檢查工具
│   ├── AdminTools.js           #   僅供管理者在 Apps Script 編輯器手動執行（見下方說明）
│   ├── lineBotGlue.js          #   doPost 入口：webhook 事件路由、訊息接收、彙整發文、每日 trigger
│   ├── lineGroupBoard.js       #   LINE 群組白名單查詢、換日序號計算
│   ├── lineMessageClassify.js  #   LINE 訊息型態分類（文字/圖片/貼圖等）
│   ├── lineStaging.js          #   暫存去重、收回標記
│   ├── lineUserId.js           #   LINE userId → 顯示名稱對應表查詢（見下方說明）
│   ├── lineDigestThreshold.js  #   分段收割門檻判斷
│   ├── lineArticleTitle.js / lineArticleContent.js  #   彙整文章的標題規則、內文排版
│   └── test.js                 #   僅供手動在 Apps Script 編輯器執行的維運工具（見下方說明）
├── test/                     # Vitest 單元測試，一比一對應 src/*.js 的每個匯出函式
│   └── doubles/                #   手刻的 SpreadsheetApp / LockService / CacheService / DriveApp / PropertiesService 測試替身
├── tools/                    # 一次性維運工具（不是正式程式的一部分，用完可從 GAS 專案刪除）
├── .scratch/                 # 開發過程的 spec 與 ticket 文件（feature 拆解紀錄，每個功能一個子資料夾）
├── MANUAL_VERIFICATION.md    # 手動驗收清單（涵蓋自動化測試碰不到的 GAS 環境行為）
├── package.json
└── vitest.config.js
```

## 開始使用

### 1. 建立試算表並綁定 GAS 專案

1. 建立一份新的 Google 試算表——這會是整個 BBS 的資料庫。
2. 「擴充功能」→「Apps Script」，會開啟一個綁定此試算表的 GAS 專案。

### 2. 把程式碼放進 Apps Script 專案

兩種方式擇一：

**方式 A：用 [clasp](https://github.com/google/clasp)**（推薦，適合之後要持續同步更新）

```bash
npm install -g @google/clasp
clasp login
```

在 GAS 編輯器的「專案設定」複製指令碼 ID，於本機 `src/` 目錄下建立 `.clasp.json`（此檔案已加進 `.gitignore`，不會被提交；可以複製專案根目錄的 `.clasp.json.example` 當起點）：

```json
{
  "scriptId": "貼上你的指令碼 ID",
  "rootDir": "."
}
```

於 `src/` 目錄下執行 `clasp push`。

**方式 B：手動複製貼上**

在 GAS 編輯器裡，依 `src/` 目錄下的檔案清單，逐一建立同名的指令碼檔案（`.js` 檔用「指令碼」、`Index.html` 用「HTML」），把內容複製貼上。`appsscript.json` 需要在編輯器的「專案設定」勾選「顯示 appsscript.json 資訊清單檔案」後才能編輯。

### 3. 部署為網頁應用程式

GAS 編輯器右上角「部署」→「新增部署作業」→ 類型選「網頁應用程式」：

- **執行身份**：我（對應 `appsscript.json` 裡的 `USER_DEPLOYING`）
- **誰可以存取**：依你的需求決定（`appsscript.json` 目前預設 `ANYONE`，即任何有網址、且登入 Google 帳號的人都能開啟——這只決定「誰能打開這個網頁」，跟站內自己的帳號權限系統是兩層不同的機制，部署前建議重新確認這個選項是否符合你的需求）

部署後會拿到一組網頁應用程式網址。第一次開啟時，`ensureSchema` 會自動建立 `Users`/`Boards`/`Articles`/`Replies`/`Permission`/`LineGroupBoards`/`LineStaging`/`LineUserId` 八張工作表，並把 `Permission` 表填入預設的 `newbie`/`user`/`admin` 三個角色。`LineGroupBoards`/`LineStaging`/`LineUserId` 三張只會建立表頭，不會有預設資料——這三張是 LINE 機器人功能專用，只有在你要啟用該功能時才需要手動維護（見下方「LINE 群組對話紀錄機器人設定」）。

### 4. 讓自己成為管理者

新註冊的帳號一律是 `newbie`（依 `Permission` 表預設，只能登入、看不到任何看板內容）。第一個帳號需要**手動**到 `Users` 工作表把自己那一列的 `role` 欄位改成 `admin`——這是刻意的設計，整個專案裡沒有任何網頁介面可以修改角色或看板設定，角色、權限、看板、`AllowRoles` 都只能透過直接編輯 Google 試算表操作。

### 5.（選用）幫使用者手動重設密碼

`src/AdminTools.js` 提供一支 `resetUserPasswordManually`，沒有任何網頁進入點，只能在 Apps Script 編輯器裡手動選取這支函式、填入目標帳號與新密碼後執行。詳見該檔案開頭的註解。

### 從既有部署升級：圖片欄位格式遷移（圖片張數突破輪）

如果你是**從舊版更新**（試算表裡已經有文章資料，`Articles` 表還是舊版的 `imageUrl1`/`imageUrl2`/`imageUrl3` 三個獨立欄位），部署這一輪的新程式碼**之前**，必須先手動執行一次遷移工具，否則舊文章的圖片會因為新程式碼只認得單一個 `imageUrls` 欄位而「憑空消失」：

1. 把 `tools/migrateArticleImagesToArray.gs.js` 貼進 Apps Script 編輯器（連同 `src/imageStorage.js` 一起，遷移工具會用到裡面已經有自動化測試涵蓋的 `compactImageUrls`）。
2. 在函式下拉選單選擇 `migrateArticleImagesToArray`，按執行。
3. 打開「執行項目」查看 Logger 印出的統計結果（轉換筆數／已是新格式跳過筆數／沒有圖片跳過筆數），確認數字合理。
4. **確認統計結果無誤之後，才能部署本輪其餘的新程式碼**（`schema.js`/`postArticle.js`/`editArticle.js`/`deleteArticle.js`/`boardBulk.js`/`articleDetail.js`/`Code.js`/`Index.html`）——部署順序反過來會導致新程式碼讀不到舊格式的圖片資料。
5. 確認沒問題後，`migrateArticleImagesToArray.gs.js` 可以從 Apps Script 專案裡刪除（`imageStorage.js` 不用刪，是正式程式碼的一部分）。舊的 `imageUrl2`/`imageUrl3` 兩欄（原本的 K、L 欄）遷移後不會被自動清空或刪除，會保留在試算表裡當備份。**這兩欄之後可以安全手動刪除**——目前所有程式碼（`schema.js`/`postArticle.js`/`editArticle.js`/`deleteArticle.js`/`boardBulk.js`/`articleDetail.js`）都只讀寫 J 欄（`imageUrls`），沒有任何地方會再讀 K、L 兩欄；建議至少保留到你確認過幾篇既有文章的圖片都正常顯示、對整個系統有信心之後，再到 Sheets 介面手動刪除這兩欄（刪除前一樣建議先手動複製一份整份試算表當備份，這是刪除任何資料前的通用建議，不是這兩欄特有的風險）。

全新建立的試算表（`ensureSchema` 從零建立）不需要這個步驟，一開始就是新格式。

## 權限系統

角色與權限完全資料化，定義在 `Permission` 工作表：一列一個角色，8 欄各自是一項布林值權限（文章讀 / 文章發表 / 文章編輯刪除本人 / 回覆讀 / 回覆發表 / 回覆刪除本人 / 排行榜 / 登入）。要新增角色、調整某個角色能做什麼，直接編輯這張表即可立即生效，不用改程式碼。

`Boards` 工作表另有 `AllowRoles` 欄位，可以針對單一看板疊加限制：留空代表除了管理者外沒有人看得到，填 `ALL` 代表沒有額外限制，或填入逗號分隔的角色清單。

管理者（`role = admin`）編輯 / 刪除他人內容、略過看板存取限制的能力，是程式碼裡唯一保留的寫死判斷，不透過 `Permission` 表設定——這是目前唯一的例外，其餘所有權限都是資料驅動。

## LINE 群組對話紀錄機器人設定

這項功能預設不會啟用——`doPost` 進入點程式碼一直都在，但沒有任何群組被授權之前，收到的所有訊息都會被忽略。要啟用，除了本來就要走過的部署流程，還需要額外幾個步驟：

1. **建立 LINE Messaging API Channel**（在 [LINE Developers Console](https://developers.line.biz/console/)），取得 Channel Access Token。
2. **在 GAS 專案的 Script Properties 填入 `LINE_CHANNEL_ACCESS_TOKEN`**（編輯器左側「專案設定」→「指令碼屬性」）。
3. **同一個地方再填一筆 `LINE_BOT_USER_ID`**：登入 [LINE Developers Console](https://developers.line.biz/console/) → 這個 Channel 的「Basic settings」頁面，找到「Bot user ID」（`U` 開頭 + 32 碼十六進位字元；**不是**同一頁看到的那個 10 碼數字 Channel ID，兩者是不同的識別碼）。這個值會用來讓 `doPost` 檢查收到的 webhook 是不是真的要給這個 bot（見下方安全性說明）；沒有填的話這道檢查會直接放行，不影響功能，只是少了這層防護。**如果填完之後訊息都進不了 `LineStaging`**，很可能是這步驟填錯了值（Console 頁面上「你自己（開發者帳號）的個人 User ID」跟「bot 自己的 User ID」格式長得一樣、很容易搞混）——`src/test.js` 裡的 `checkLineBotUserId()` 可以直接問 LINE 官方 API 要 bot 真正的 User ID，比對照 Console 畫面手動找更不容易出錯，見該函式開頭的說明。
4. **把 bot 加入要記錄的 LINE 群組**，在群組裡傳一則訊息；因為這個群組還沒授權，訊息不會被記錄，但 `doPost` 會把 `groupId` 印到 Apps Script 的「執行」（Executions）紀錄裡，方便你查到要填什麼（LINE 沒有任何介面能直接查群組 ID，只能透過 webhook 事件取得）。
5. **在試算表的 `LineGroupBoards` 分頁手動新增一列**：`groupId` 填上一步查到的值、`groupName` 自訂顯示名稱、`boardId` 填要彙整貼到的看板 ID（**該看板必須已經存在於 `Boards` 分頁**）。`lastDigestDate`/`todayDigestCount` 留空，系統自動維護。
6. **重新部署 Web App**——這個功能用到 `UrlFetchApp`（呼叫 LINE API）與 `ScriptApp.newTrigger`（建立每日排程），是全新的權限需求，重新部署會跳出新的授權畫面。可以先在編輯器手動執行 `src/test.js` 裡的兩支函式確認授權已經生效：
   - `checkUrlFetchPermission()`：驗證 `UrlFetchApp` 權限，安全、可重複執行，不會寫入任何資料。
   - `triggerScriptAppPermission()`：驗證 `ScriptApp` 權限，會建立一個測試用的 trigger 來觸發授權——**執行完記得手動到編輯器左側「觸發條件」（鬧鐘圖示）把這個測試 trigger 刪掉**（`ScriptApp.deleteTrigger()` 在協作者帳號下會報錯，這支函式故意不自動清，需要手動處理）。
7. **在編輯器手動執行一次 `installDailyLineDigestTrigger`**（`src/lineBotGlue.js`），建立每日 00:05（Asia/Taipei）的換日檢查排程，把當天沒達到門檻的殘餘對話收尾送出。這個函式有防重複保護，不小心重複執行也不會建立出多個排程。**注意**：這支函式建立的 trigger 時間寫死在程式碼裡（`atHour(0).nearMinute(5)`），如果想要別的時間（例如 23:50），需要執行完之後另外到編輯器左側「觸發條件」畫面手動把那個已安裝的 trigger 改成想要的時間——這是 Apps Script 允許的操作，改完之後**實際運作時間**就是你手動設定的那個，會跟程式碼裡寫的預設值不一致；如果之後重新執行一次 `installDailyLineDigestTrigger`（例如重新部署、防重複保護沒生效），會照程式碼預設值裝出一個 00:05 的新 trigger，記得留意這個落差。
8. **把 LINE Developers Console 裡該 Channel 的 Webhook URL 設定成部署後的 `/exec` 網址**，並開啟「Use webhook」。

完成以上步驟後，該群組的對話會依圖片數（≥99 張）或文字量（≥8000 字元）自動分段彙整成看板文章，作者顯示為固定的 `SYSTEM`（不佔用任何排行榜名額）；沒有達到門檻的殘餘內容會在每天 00:05 被收尾送出。

**發話人顯示名稱怎麼來**：LINE 的「取得群組成員檔案」API（換取暱稱用的）只開放給已驗證／Premium 帳號，一般未驗證帳號打不通，所以這個功能**不會**自動抓到真實暱稱。訊息一開始一律以發話人的 LINE `userId`（`U` 開頭的一串亂碼）顯示，同時系統會自動把這個 `userId` 登記一列到 `LineUserId` 分頁（`DisplayId` 欄預設等於 `userId`）。你可以隨時把某個 `userId` 對應的 `DisplayId` 手動改成看得懂的名字，**下一次**同一個人的訊息被彙整發文時就會用新名字顯示（已經發布的舊文章不會回頭更新）。

**安全性說明**：GAS 的 `doPost(e)` 事件物件不支援讀取 HTTP 標頭（Google 官方已明確表態不會支援此功能），代表 `X-Line-Signature` 這個 LINE 官方建議的 webhook 簽章驗證機制在純 GAS 架構下做不到，不是刻意不做。目前的替代防護：`doPost` 會先比對 webhook payload 的 `destination` 欄位（這個 bot 自己的 User ID，同一個 bot 不管訊息來自哪個群組都相同）是否等於 Script Properties 存的 `LINE_BOT_USER_ID`，不符合就直接忽略、不寫入任何資料。這個值不會透過 LINE App 的一般互動介面暴露給使用者，查詢官方 API 也需要 channel access token 這個只有開發者自己持有的私密憑證，比對外公開的 `groupId` 更接近「共享密鑰」的性質——但終究不是密碼學簽章，一旦這個值洩漏（例如不小心 commit 進版本控制、log 外洩），防護就完全失效，且沒有偵測洩漏的機制，屬於縱深防禦的一層，不是完整的身分驗證保證。實際存取控制仍然主要靠 `LineGroupBoards` 的白名單——任何人只要知道或猜到一個已授權的 `groupId`（群組成員都看得到，不是機密），理論上能偽造內容讓它被記錄並公開張貼；不在白名單裡的 `groupId` 則無論如何都不會觸發任何寫入。如果需要更嚴謹的驗證，其中一個可行方向是額外架一個能讀取 HTTP 標頭的外部中介服務（例如 Cloud Function）先驗證簽章、驗證通過才轉送到這個 GAS 端點，這是可以獨立進行的後續工作。

## 開發

```bash
npm install
npm test
```

每個 `src/*.js` 的匯出函式都有對應的單元測試,透過手刻的 Google Apps Script 服務測試替身(`test/doubles/`)模擬 `SpreadsheetApp`、`LockService`、`CacheService`、`DriveApp`、`PropertiesService`,不需要真正的 Google 帳號或網路連線就能跑完整套測試。`Code.js`/`lineBotGlue.js`(膠水層)、`test.js`(手動維運工具)與 `Index.html`(前端)沒有自動化測試,靠 `MANUAL_VERIFICATION.md` 的清單在真實 GAS 環境手動驗收。

`test/doubles/fakeSpreadsheet.js` 的每個分頁(sheet)物件會記錄自己被 `getValues()`/`getRawValues()` 讀取的次數(`sheet._getReadCount()`),只計「真正讀資料」的呼叫,寫入操作(`appendRow`/`setValues`/`setNumberFormat`/`setDataValidation`)不計入。這是為了讓測試能直接斷言「這次操作總共讀了幾次某張表」,用來驗證讀寫次數優化(避免同一次執行內重複讀取同一張表)確實有生效,而不只是相信程式碼有改對。

### 工程原則:試算表讀寫次數精簡(第五輪起持續適用,之後每一輪都要延續)

GAS + Google Sheets 這個組合裡,**讀寫「次數」造成的延遲,遠大於單次讀寫「資料量」的影響**——一次 `getRange(...).getValues()` 不管讀 10 列還是 10,000 列,都是同一次跨網路呼叫的成本;真正貴的是同一次操作內反覆呼叫 `SpreadsheetApp` 好幾次。第五輪(效能優化輪,見下方「已知限制」與 `.scratch/gas-bbs-perf-optimization/`)已經把這個原則系統性地套進角色權限查驗(session 快照快取)跟看板文章讀取(整批預載 + 版本戳比對)這兩大塊,具體做法見該輪的 spec 與 ticket 檔案。

**這條原則之後每一輪異動都要延續,不是這輪做完就結束**:

- 新增或修改任何 `src/*.js` 函式時,同一次操作內如果需要用到同一張表的資料兩次以上,優先想辦法合併成一次讀取(例如一次多讀幾欄,而不是分兩次各讀一欄),而不是分開各自呼叫 `getRange`。
- 修改測試時可以用 `sheet._getReadCount()` 直接斷言「這次操作只讀了幾次」,把這個目標變成可驗證的測試案例,不要只憑肉眼檢查程式碼、覺得「看起來只讀一次」就結束。
- 寫入路徑(發文/編輯/刪除/回覆)目前刻意維持「每次即時查角色與看板權限,不套用快取」(見第五輪 spec 的 Implementation Decisions),這條界線之後如果要放寬,需要重新評估安全性取捨,不要在沒有重新確認的情況下順手套用讀取路徑的快取邏輯。
- **交接文件(`/handoff`)務必把這一整段原則帶進去,不要只帶前一輪的技術現狀,讓這條原則透過每一輪交接持續傳下去**——這是使用者明確要求持續沿用的工程慣例,不是這輪的一次性優化。

### 工程原則:`Index.html` 樣板編譯期陷阱(圖片張數突破輪部署後發現,之後每一輪都要延續)

GAS 的 `HtmlService.createTemplateFromFile` 編譯 `.html` 樣板時,是把**整份檔案當純文字**掃描樣板插值記號跟指令碼標籤的開闔位置,藉此決定哪些片段要被評估、哪些是靜態輸出——這個掃描**不理解 JS 或 HTML 的註解語法**,不會因為某段文字寫在 `//` 或 `<!-- -->` 裡面就跳過。這代表:如果在 `Index.html` 的任何地方(包含註解、包含字串常值)寫出跟真正的樣板插值語法或指令碼標籤開闔字面完全一樣的文字——即使只是在註解裡「描述」這串語法本身、不是真的要用它——都可能讓 GAS 誤判成真正的結構記號,導致整份樣板編譯錯亂。這個問題只有部署到真實 GAS 環境才會顯形:`node --check` 之類的語法檢查只驗證抽出來的 `<script>` 內容是不是合法 JS,完全不會執行到 GAS 這一層的樣板掃描,兩者是不同的檢查層級,前者測不出後者的問題。

**這條原則之後每一輪異動都要延續,不是這輪修完就結束**:

- 在 `Index.html` 裡寫任何註解、說明文字時,絕對不要照抄樣板插值語法的實際寫法或指令碼標籤的開闔字面——要描述這類語法時,用文字說明(例如「不跳脫版樣板插值語法」)取代真正的符號組合,或是拆開來寫(例如中間插入全形字元或空格)避免湊出完整的記號。
- 修改前先跑一次 `grep` 找找看整份 `Index.html`(不限於自己這次動到的範圍)有沒有意外冒出的裸露記號,確認乾淨了才算修完——這條檢查沒辦法自動化成 Node 測試,只能人工掃描。
- 部署到真實 GAS 環境之後,先確認整個頁面能正常打開、沒有樣板編譯錯誤,是驗收任何一輪改動的第一步,不能只憑 Node 測試全綠就當作已經驗證完成。
- **交接文件(`/handoff`)務必把這一整段原則帶進去**,理由跟上面「試算表讀寫次數精簡」那條一樣。

### 工程原則:非同步操作的防連點鎖必須在發出第一個非同步呼叫之前同步上鎖(圖片自動分批上傳輪部署後發現,之後每一輪都要延續)

專案裡「發文」「儲存編輯」這類寫入操作,都靠一個簡單的 `pendingRequests[key]` 旗標防止使用者連點造成重複送出:函式一開始檢查 `isRequestPending(key)`,是的話直接 `return`;否則呼叫 `beginRequest(key)` 上鎖,操作結束(不管成功失敗)呼叫 `endRequest(key)` 解鎖。這個機制本身沒問題,但**上鎖的時間點**很關鍵:`beginRequest(key)` 必須是函式一開始、還沒有任何 `await`/`.then()`/非同步空檔之前就同步呼叫——只要上鎖動作被延後到任何一個非同步操作**之後**才執行(例如「先上傳圖片,上傳完成後才上鎖」這種寫法),上鎖之前的這段等待期間,鎖形同虛設:使用者在這段空檔再點一次,第二次呼叫的 `isRequestPending` 檢查會看到鎖還沒上、直接放行,兩個獨立的非同步流程各自跑到底,可能造成重複上傳、甚至重複建立文章。圖片自動分批上傳輪把單次上傳改成多批依序上傳、耗時明顯變長之後,這個原本理論上就存在、但視窗很短不容易踩到的問題,變得容易在真實使用時被踩到。

**這條原則之後每一輪異動都要延續,不是這輪修完就結束**:

- 任何「防連點」用的 `beginRequest(key)`,一律放在函式最開頭、通過參數驗證之後、第一個 `await`/`.then()`/`google.script.run` 呼叫之前,不要等非同步操作完成才上鎖。
- 新增任何非同步操作的入口函式時,檢查一下: 如果使用者在這個函式執行到一半時再次觸發同一個入口,會發生什麼事?如果答案是「可能重複執行」,就是這個問題。
- 上鎖時機提早之後,原本「這裡還沒上鎖所以不用 `endRequest`」的失敗處理分支要一併檢查,確認每一個提早 `return`(含失敗、例外)的路徑都有對應解鎖,不然會變成按鈕永久卡死的新問題(見圖片自動分批上傳輪的修正,兩個問題是同一次修正一起處理的)。
- **交接文件(`/handoff`)務必把這一整段原則帶進去**,理由跟上面兩條一樣。

## 已知限制

- 資料庫是 Google 試算表，讀取邏輯本質上還是整張表撈出來後在應用程式端排序篩選，沒有伺服器端的分段查詢——**第五輪已經針對「讀寫次數」這個實際上影響延遲最大的因素做了系統性優化**（角色權限查驗改用 session 快照快取、看板文章改成整批預載 + 版本戳比對，見上方「工程原則」一節與 `.scratch/gas-bbs-perf-optimization/`），但「單次讀取仍是整張表掃描」這個底層架構本身沒有變；文章量非常大時（例如匯入多年份的舊資料，或單一看板文章數遠超過批次上限）仍可能需要重新評估效能。
- GAS 單次執行有 6 分鐘上限，理論上資料量極大時可能受影響，目前規模下未曾觸發。
- 沒有全文搜尋、標籤分類、已讀/未讀、推文機制、IP 限流；回覆目前只能刪除不能編輯。
- LINE 群組對話紀錄機器人不驗證 webhook 請求來源（見上方安全性說明）；訊息的收回（unsend）只能標記已收回、不會刪除紀錄，也不會回頭修改已經彙整張貼出去的文章——但如果是在還沒被彙整收割前就收回，這則訊息（含圖片）不會出現在最終彙整出來的文章裡；發話人顯示名稱預設是 LINE `userId` 原始值，需要管理者透過 `LineUserId` 分頁手動對應成真實姓名，且只影響之後新發布的文章，不會回頭更新舊文章。
- 發文/儲存編輯的連點保護（`pendingRequests` 旗標，見上方工程原則）是單一分頁的記憶體狀態，不會跨分頁同步——如果同時開兩個分頁對同一篇文章分別按發布/儲存，兩邊互不知道對方存在，理論上仍可能各自成功送出（重複文章或版本互相覆蓋）。這是一般網頁在沒有伺服器端冪等性 token 機制時的通用限制，不是這個專案特有的缺口，目前沒有針對這個情境額外處理。

## License

尚未指定授權條款。
