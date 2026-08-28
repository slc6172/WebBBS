status: ready-for-agent

# GAS BBS 優化輪四 — LINE 群組對話紀錄機器人

## Problem Statement

使用者手上有幾個 LINE 群組,裡面的討論完全沒有留存機制——訊息隨時間被洗掉,無法回顧,沒有即時在線的成員也無從事後掌握群組動態。這個 BBS 系統(round 3 結束時)已經有完整的看板/文章/圖片儲存/角色權限基礎建設,但沒有任何方式把 LINE 群組對話跟這套既有系統連起來,群組討論與 BBS 是兩個互不相干的世界。

## Solution

在同一個既有 GAS 專案(同一份試算表、同一次部署)新增一個 `doPost` 進入點,接收 LINE Messaging API 的 webhook 事件。系統依「管理者手動維護的群組白名單」過濾訊息,把授權群組的對話內容暫存起來,達到門檻(圖片數/字數/換日)時整批彙整成一篇看板文章,以固定的 `SYSTEM` 身分張貼,完全重用既有的發文、圖片儲存、看板即時更新機制——LINE 對話紀錄讀者看到的,就是看板裡一篇跟其他文章長得一樣的文章,不需要另外架一套獨立的呈現系統。

這次是 round 3(權限系統)之後的第四輪優化,base 是目前 zip 裡的完整程式碼。過程中沿用了先前一次以 openspec 流程做過的訪談與實作探索(`linebotspec`/`linebotcode`)所產出的方向性決策,但那批文件是在 round 2 的基礎上做的,還沒有 round 3 才出現的 `Permission`/`AllowRoles` 概念;本次 grilling 已經把「這個新系統跟舊方向決策要如何相處」的部分重新確認過一輪,細節見下方 Implementation Decisions。

## User Stories

### 訊息接收與暫存

1. As a LINE 群組成員,我想要我在群組裡傳的文字訊息被自動記錄下來,連同我的顯示名稱跟傳送時間,so that 之後有人回顧對話紀錄時知道是誰在什麼時候說了什麼。
2. As a LINE 群組成員,我想要我傳的圖片被保留下來並顯示在對話紀錄裡,so that 對話中提到的照片內容不會隨時間遺失。
3. As a LINE 群組成員,我想要我傳的貼圖、影片、語音、檔案、位置分享,即使沒有被完整記錄實際內容,至少在對話紀錄裡看得到「這裡曾經有一則貼圖/影片/語音/檔案/位置」的固定文字註記,so that 對話的完整脈絡不會因為這幾種訊息類型被記錄時整段消失,讀的人知道當下曾經發生過什麼類型的互動;這類註記也 SHALL NOT 計入判斷是否達到張貼門檻所使用的圖片數量。
4. As a LINE 群組成員,我想要成員加入/退出群組等系統事件完全不被記錄,so that 對話紀錄只保留真正的對話內容。
5. As a LINE 群組成員,我想要我收回(unsend)一則還沒被張貼出去的訊息時,對話紀錄能反映「這則訊息已收回」(保留原始內容、補上註記,不刪除),so that 紀錄能忠實呈現群組裡實際發生的互動;如果這則訊息已經被彙整張貼成文章,我理解系統不會回頭修改已張貼的文章。
6. As a BBS 系統維運者,我想要同一則 LINE webhook 事件在原始訊息仍處於暫存階段時被重複送達,不會建立第二筆重複的暫存紀錄,so that 對話紀錄不會出現重複的訊息;我也理解如果重送剛好發生在原始訊息已經被收割送出、暫存紀錄已刪除之後,這種極低機率的邊界情況不做保證(不會為此另外維護一個跨越發文動作存活的去重紀錄)。

### 彙整發文

7. As a BBS 看板讀者,我想要每天(或圖片、內容量夠多時當天可能不只一次)群組對話會被彙整成一篇看板文章,so that 我不用逐則翻閱原始 LINE 對話,直接進看板看整理過的紀錄就好;某群組某天完全沒有任何對話時,系統不會為那天發一篇空文章。
8. As a BBS 看板讀者,我想要一篇對話紀錄文章裡,每則訊息都清楚標示時間跟發話人、依時間順序排列,圖片連結就放在訊息原本被分享的位置上(而不是集中列在文章末尾),so that 我能照著時間軸讀懂對話脈絡。
9. As a BBS 看板讀者,我想要同一天如果對話紀錄被拆成好幾篇,或者同一個看板同時有多個群組的對話紀錄,標題能清楚區分是第幾篇、或是哪個群組的內容,so that 我不會被好幾篇長得一模一樣的標題搞混,或漏看其中一篇。
10. As a BBS 看板讀者,我想要新張貼的對話紀錄文章能反映在看板列表的「有新內容」提示跟即時更新機制上,so that 我不用手動重整就能知道看板有新的對話紀錄可以看——這跟一般使用者發文觸發的機制完全相同。
11. As a BBS 管理者,我想要這個彙整發文的動作用一個固定的虛擬「SYSTEM」帳號張貼,不受一般使用者發文所需的角色權限限制,也不會佔用發文數排行榜的名額,so that 排行榜還是真實反映「人」的發文活躍度,不會被機器人自動發文洗榜。
12. As a BBS 管理者,我想要已成功彙整張貼成文章的暫存內容立刻從暫存區移除,暫存區只保留尚未達到張貼門檻、等待中的內容,so that 暫存試算表不會隨時間無限膨脹、不需要額外的封存或清理作業。

### 白名單與管理者設定

13. As a BBS 管理者,我想要可以直接在試算表裡手動指定「哪些 LINE 群組」的訊息會被記錄、以及各自要張貼到「哪個既有看板」,so that 我能完全掌控哪些群組的對話會被公開留存,不用改程式碼就能調整授權範圍與對應關係;這個調整也不需要重新部署。
14. As a BBS 管理者,我想要沒有被列入白名單的 LINE 群組,即使這個 bot 不小心被加入,傳的訊息也完全不會被記錄或回應,so that 不會有非預期群組的對話外洩到 BBS 上;我也理解這個群組白名單同時是本次唯一的存取控制機制——系統不會另外驗證 webhook 請求真的來自 LINE(見 Implementation Decisions 的簽章驗證決定),攻擊者必須先知道或猜到一個已授權的 `groupId` 才有辦法偽造內容,而不在白名單裡的群組無論如何都不會觸發任何寫入。
15. As a BBS 管理者,我想要同一個看板可以同時對應多個不同的 LINE 群組(彼此對話各自獨立分段、各自的門檻計算互不影響),so that 我可以把性質相近的多個群組彙整到同一個看板,又不會讓不同群組的對話混在同一篇文章裡失去脈絡。
16. As a BBS 管理者,我想要 LINE Bot 需要的憑證是透過既有的 Script Properties 機制設定,so that 憑證不會被寫死在程式碼裡外洩,管理方式也跟現有專案的其他機敏設定(例如 Drive 根資料夾 ID)一致。
17. As a BBS 管理者,如果我在授權關係設定之後,把某個群組對應的看板從試算表刪除或改名,我想要系統安靜地略過該次看板活動時間戳更新、不拋出錯誤讓其他功能跟著壞掉,but 我理解這是既有程式碼「找不到對應看板就安靜略過」行為的延伸,不是這次新增的保護機制,需要我自己留意調整對應表時看板是否仍然存在。

### 並行寫入保護

18. As a BBS 系統維運者,我想要寫入暫存資料的幾個路徑(接收訊息、達到分段門檻觸發收割、每日換日檢查)都有並行寫入保護,so that 短時間內多個觸發同時發生時(例如一則新訊息到達的同時該群組剛好達到張貼門檻),不會互相覆蓋或漏記訊息,最終呈現的結果是這些操作依序完成後的一致狀態。

## Implementation Decisions

### 架構:同一個既有 Apps Script 專案,不另開專案

新增的 `doPost(e)` 與所有 LINE 相關膠水邏輯,放在同一個既有專案裡,不拆成獨立專案或 Library。原因是既有的「看板新內容提示/即時更新」機制用的 `CacheService.getScriptCache()` 是綁定在**實際執行程式碼的那個 Apps Script 專案**上,不是呼叫端的專案——如果 LINE bot 邏輯放在另一個專案(不論是直接 `SpreadsheetApp.openById()` 寫入,還是把現有專案發布成 Library 被呼叫),SYSTEM 發的文章要等 cache TTL 過期或剛好有真人發文才會被動反映到前端,不會是即時的。同一專案內可以直接沿用 `getSpreadsheet_()`、既有的發文/圖片儲存/看板更新函式,確保 SYSTEM 發文的前端反映行為跟一般使用者發文完全一致。

代價(已知、接受):同一個部署裡混了網站與 webhook 兩種進入點,任一邊改動都要重新部署整個專案;這次新增 `UrlFetchApp`/webhook 相關的權限範圍後,下次手動重新部署會再跳出一次授權畫面(比照圖片功能上線時的先例,已知且可接受)。

膠水邏輯(`doPost`、事件路由、`harvestGroupDigest_`、trigger 安裝函式等)放進新檔案 `src/lineBotGlue.js`,不塞進既有的 `Code.js`——`Code.js` 已經是全專案最大的檔案,且「網站 doGet 膠水」跟「LINE webhook doPost 膠水」是兩條完全不同的進入點,拆開檔案不影響 GAS 全域命名空間共用的執行行為。

### Schema:新增兩張表,沿用既有 `ensureSchema` 模式

在 `schema.js` 的 `SHEET_HEADERS` 新增兩個項目:

- `LineGroupBoards`:欄位 `groupId` / `groupName` / `boardId` / `lastDigestDate` / `todayDigestCount`。身兼「授權群組白名單」與「群組對看板對應表」,由管理者直接在試算表手動維護;允許多個群組列指向同一個 `boardId`。`lastDigestDate`/`todayDigestCount` 是產生標題序號所需的最小持久狀態(暫存資料用完即刪,序號沒有別的地方可以回溯),比照既有 `Users.loginCount`/`Boards.latestArticleAt` 這類「小型持久計數器存在該實體所屬列上」的慣例。
- `LineStaging`:欄位 `groupId` / `messageTime` / `displayName` / `messageType` / `content` / `webhookEventId` / `recalled`。彙整張貼前的暫存區,張貼成功後對應列即刪除,不做長期保存。

這兩張表都比照既有工作表模式,在 `ensureSchema` 裡自動確保欄位結構存在,是純粹的 header 初始化,**不需要**比照 `Permission` 表那種「首次建立寫入預設列」的種子邏輯——這兩張表本來就該是空的,等待管理者手動填入。

`TIMESTAMP_COLUMNS` 新增 `LineGroupBoards: [4]`(`lastDigestDate`)與 `LineStaging: [2]`(`messageTime`),跟 `createdAt`/`editedAt` 走同一套「強制純文字格式,避免 Sheets 把日期樣式字串自動轉成 Date/序列值」的既有機制與寫入慣例(寫入時前導單引號、讀回時直接比對不帶引號的字串)。

### 訊息分類與暫存記錄

依 LINE `message.type` 分流:
- `text`:完整記錄 `message.text`。
- `image`:記錄型態與訊息 ID,實際下載/上傳交給圖片儲存流程處理(見下方「圖片處理」)。
- `sticker`/`video`/`audio`/`file`/`location`:一律轉成固定文字註記(例如「此處有一則貼圖」「此處有一段影片」),不保存實際內容,也不計入圖片數量門檻。
- 其他無法辨識的型態:安全地歸類為忽略,不記錄也不報錯,避免未來 LINE 新增訊息型態時整支程式出錯。
- 非 `message` 類型的事件(成員加入/退出等系統事件)在事件路由層直接略過,不進入分類邏輯。

發話人 `displayName` 需要透過 LINE 的「取得群組成員檔案」API(`UrlFetchApp.fetch`)以 `event.source.userId` 換取,這步驟連同圖片內容下載都屬於 I/O glue,不特別拆成獨立 seam(見 Testing Decisions)。

### 圖片處理:重用既有 Drive 儲存機制,新增下載步驟

既有 `imageStorage.js` 的 `saveArticleImage(drive, properties, base64Data, mimeType, fileName, yyyyMM)` 接受的是 base64 資料,不管這份資料原本是使用者瀏覽器上傳,還是這次新增的「從 LINE 內容 API 下載的圖片」,格式一致,`imageStorage.js` 本身不需要任何修改。LINE 這邊多出來的步驟只是:`UrlFetchApp.fetch` 呼叫 LINE 的訊息內容 API 取得圖片 blob → 轉成 base64/取得 mimeType → 呼叫既有的 `saveArticleImage`。分享權限設定、連結格式、月份子資料夾等既有邏輯不變。

### SYSTEM 發文:繞過角色權限檢查,包含 `AllowRoles`

發文者固定寫死字串 `"SYSTEM"`,不建立對應的 `Users` 列——既有的發文數統計邏輯(`incrementUserStat`)找不到對應使用者時本來就安靜略過、不報錯,不建立使用者列同時解決「不需要額外處理」跟「SYSTEM 不會洗榜」兩個問題。

**round 3 新增的 `AllowRoles` 也一併繞過**,不只是角色的 `articlePost` 權限。理由:`LineGroupBoards` 對應關係本身就是管理者的明確意圖表達(「這個群組要發到哪個看板」是管理者手動設定的),`AllowRoles` 是「一般使用者能不能看到/操作這個看板」的機制,兩者是不同層次的問題——如果管理者不想讓 LINE 對話紀錄進某個看板,直接不要在 `LineGroupBoards` 設定對應關係即可,不需要疊加第二層判斷。技術上,這代表發文路徑呼叫的是底層 `createArticle`,不經過會做兩層檢查的 `createArticleForRole`(這點跟 round 2 時的原始方向決策一致,round 3 新增的 `AllowRoles` 檢查也在繞過範圍內)。

讀取端不需要任何特殊處理:SYSTEM 發的文章就是透過 `createArticle` 產生的一般 `Articles` 列,一般使用者瀏覽該看板時,既有的 `getArticlesForRole`/`getBoardsForRole` 對 `AllowRoles` 的檢查,檢查的是「讀者」的角色能不能看這個看板,跟這篇文章是誰發的無關,不需要改動。

### 發文核心:拆出不上鎖版本,取代原本的巢狀取鎖

既有 `postArticle.js` 的 `createArticle(spreadsheet, lock, input)` 內部固定「驗證 → 取鎖 → 寫入 → 放鎖」。這次把「寫入」的部分(`appendRow` + `incrementUserStat`)拆成新的 `createArticleUnlocked_(spreadsheet, input)`,`createArticle` 改成「驗證 → 取鎖 → 呼叫 `createArticleUnlocked_` → 放鎖」的薄 wrapper,公開簽名與行為完全不變,既有呼叫端(`createArticleForRole`、`postArticleFromForm` 等)與既有測試不需要改動。

彙整發文(`harvestGroupDigest_`)不透過 `createArticle`,而是直接呼叫既有已匯出的 `validateArticleTitle`/`validateArticleContent`,再呼叫這個新的 `createArticleUnlocked_`。這樣一來,`harvestGroupDigest_` 從「讀暫存 → 組標題/內文 → 寫入文章 → 刪暫存列 → 更新 `lastDigestDate`/`todayDigestCount`」整段流程,全程只用自己在最外層取的**同一把**鎖,完全不會再有「已持鎖期間又呼叫另一支會自己取鎖的函式」這種巢狀取鎖情境——不需要驗證 GAS script lock 在同一次執行內是否可重入,因為程式碼結構上根本不會發生;也因為鎖從頭到尾沒有釋放過,不會重新引入「兩個並行 harvest 同時讀到同一批暫存列、造成重複發文或刪錯列」的競態窗口。`bumpBoardVersion`/`bumpBoardActivity_` 比照既有 `postArticleFromForm` 的慣例,在鎖釋放之後才呼叫(這兩個動作本身不影響暫存資料的一致性,不需要包在臨界區間內)。

### 換日序號:單一比較分支,不做防禦性雙重比對

`lastDigestDate` 走跟 `createdAt`/`editedAt` 完全一樣的處理方式(見上方 Schema 段落的 `TIMESTAMP_COLUMNS`)——寫入時強制純文字格式、前導單引號只影響寫入當下的解讀方式,讀回時不含引號。因此「這是不是同一天」的比對只需要 `lastDigestDate === today` 單一分支,不需要同時比對帶引號與不帶引號兩種形式。

把這段純決策邏輯從原本混雜了 sheet I/O 的寫法中拆出來,新增一個 seam:`computeNextDigestSequence(lastDigestDate, todayDigestCount, today)` → 回傳這是該群組今天的第幾篇。換日(`lastDigestDate` 不是今天,包含首次使用、`lastDigestDate` 為空字串的情況)時歸零重算為 1,否則 `todayDigestCount + 1`。呼叫端(glue)負責找到對應列、讀出兩個欄位值、呼叫這支函式、把結果連同今天的日期一起寫回同一列。

### 標題規則

標題是否帶群組名稱、是否帶篇數序號,是兩個獨立判斷:
- 該群組當天第 2 篇以上,**或**所屬看板同時被多個群組共用 → 標題帶群組名稱
- 只有「該群組當天第 2 篇以上」→ 才在標題加上「(第N篇)」序號

也就是「看板被多群組共用,但這是該群組今天第一篇」的情況,標題會帶群組名稱但不帶序號。這比 `linebotspec` 原始文字描述(讀起來像兩者綁在同一個條件觸發)更精確,是先前實作階段比對範例後修正的結果,這次確認採用這個實作邏輯為準:

```js
function buildDigestTitle(params) {
  // params: { date, groupName, sequenceNumber, boardSharedByMultipleGroups }
  var includeGroupName = params.boardSharedByMultipleGroups || params.sequenceNumber >= 2;
  var includeSequenceSuffix = params.sequenceNumber >= 2;

  if (!includeGroupName) {
    return params.date + 'Line群組對話紀錄';
  }
  var title = params.date + params.groupName + 'Line群組對話紀錄';
  if (includeSequenceSuffix) {
    title += '(第' + params.sequenceNumber + '篇)';
  }
  return title;
}
```

日期格式沿用既有補零慣例,跟 `createdAt` 的日期部分一致。

### 內文排版

每則訊息獨立一行,格式固定為「`[HH:mm] 顯示名稱: 內容`」,依訊息時間排序;圖片連結、固定文字註記都已經是呼叫端組好的 `content` 字串,排版函式本身只負責排序與拼接,不判斷訊息型態。

### 分段/收割門檻(以群組為單位各自獨立計算)

- 暫存內容中的圖片數(不含貼圖等固定註記類型)達 **3 張**
- 暫存內容的文字量累計達 **8000 字元**
- 對話所屬日期(Asia/Taipei)已經換日

三者任一觸發,即把該群組當下暫存的所有內容整批彙整成一篇文章,計數器歸零。3 張對應 `Articles` 本身只有三個固定圖片欄位(`imageUrl1`~`imageUrl3`)的既有限制;8000 字元是既有 10000 字元硬上限之下預留的安全緩衝。以群組獨立計算,是因為一個看板可能同時對應多個群組,不獨立計算會讓某個群組突然熱鬧時拖累或提前觸發另一個群組的收割時機。

換日檢查透過每日 00:05(Asia/Taipei)的 installable time-driven trigger 執行,逐一檢查每個授權群組是否有殘餘暫存內容(有則收割送出當天最後一篇,沒有則不動作)。既有專案 manifest 時區已經是 Asia/Taipei,不需要額外處理時區轉換。trigger 安裝透過一支一次性的初始化函式建立,**這次額外加上防重複保護**:建立前先用 `ScriptApp.getProjectTriggers()` 檢查是否已存在同一個 handler function 的 time-driven trigger,存在就跳過不重複建立(避免重複執行導致當天被收割兩次)。

### 並行寫入保護

暫存資料的所有寫入路徑(webhook 接收訊息、門檻觸發收割、換日 trigger)都用 `LockService.getScriptLock()` 上鎖,比照既有專案「檢查+寫入」類關鍵操作一律上鎖的慣例。

### 去重與收回

依 `webhookEventId` 判斷是否已有對應暫存列存在,避免 LINE webhook 重送在原始訊息仍在暫存階段時被重複記錄;若對應暫存列已因彙整張貼而被清除,對該事件重複送達是否仍建立新紀錄不做保證(已知邊界情況,機率極低,不另外維護跨越發文動作存活的持久化去重紀錄)。

收回(unsend)事件:找到暫存階段對應的列,補上「已收回」標記、保留原始內容不刪除;找不到對應列(訊息已被彙整張貼)則不做任何修改,不回頭修改已張貼的文章。

### 憑證與部署設定

LINE 憑證比照既有 Drive 根資料夾 ID 的慣例,存放於 `PropertiesService` 的 Script Properties。**只需要 `LINE_CHANNEL_ACCESS_TOKEN`**——這次確認不做 webhook 簽章驗證(`x-line-signature`),所以不需要 Channel Secret。

### 不做簽章驗證(Non-Goal,明確攻擊面)

`doPost` 不驗證請求來源真的是 LINE 官方伺服器。具體攻擊路徑:任何人只要知道或猜到一個已授權的 `groupId`,就能偽造符合 LINE webhook 格式的請求,讓內容被當成該群組的對話寫入暫存並最終公開張貼。這是這次 grilling 明確重新確認過、刻意接受的風險,緩解措施是 `LineGroupBoards` 白名單機制本身——不在白名單裡的 `groupId` 無論如何都不會觸發任何寫入,攻擊者必須先取得一個已授權的 `groupId` 才有機可乘。如果未來想收斂這個攻擊面,加入簽章驗證是獨立的後續 ticket,不在本次範圍內。

## Testing Decisions

好的測試只驗證外部行為(輸入/輸出),不依賴實作細節;沿用既有 `test/*.test.js`(Vitest)+ `test/doubles/`(手刻假物件,如 `fakeSpreadsheet.js`、`fakeLock.js`、`fakeDrive.js`、`fakeProperties.js`)的既有測試慣例與檔案組織方式,一個 seam 一個測試檔。

以下 8 個純函式各自獨立成檔、獨立測試,比照 `lineGroupBoard.js`/`lineMessageClassify.js` 等在先前 openspec 探索階段已經寫好、風格跟現有 `src/*.js` 一致的版本(內容邏輯沿用,檔案/測試組織方式改為對齊本專案既有慣例,不沿用 openspec 那批文件本身的格式):

1. `resolveGroupBoard(rows, groupId)` — 群組是否授權、對應到哪個看板
2. `classifyLineMessage(event)` — 依訊息型態分類成暫存紀錄形狀
3. `shouldHarvest(state)` / `hasResidualContent(state)` — 門檻判斷
4. `buildDigestTitle(params)` — 標題規則(含群組名稱/序號的獨立判斷)
5. `formatDigestContent(messages)` — 內文排序與排版
6. `hasProcessedEvent(rows, webhookEventId)` / `markRecalled(rows, webhookEventId)` — 去重、收回標記
7. `computeNextDigestSequence(lastDigestDate, todayDigestCount, today)` — 換日序號決策(這次新拆出來的 seam)
8. `createArticleUnlocked_(spreadsheet, input)` — 發文核心寫入邏輯(這次從 `postArticle.js` 拆出來的 seam),測試方式比照既有 `createArticle` 測試(注入 `fakeSpreadsheet`),差別只是不需要注入 lock

既有 `postArticle.js` 的 `createArticle`/`createArticleForRole` 測試檔**不需要修改**,重構後這兩支函式的公開行為完全不變,應該原封不動繼續通過。

**不特別拆 seam、留在 glue 層、不直接單元測試的部分**(比照現有 `Code.js` 裡的膠水函式如 `postArticleFromForm` 目前也沒有專屬測試檔的既有慣例):
- `doPost` 本身的事件路由(依 `event.type` 分派給訊息處理/收回處理)
- `LineGroupBoards`/`LineStaging` 兩張表的列讀取/寫入/刪除(欄位對應的薄轉換)
- `harvestGroupDigest_`(組合以上所有 seam 的整合流程;「不再巢狀取鎖」這件事是靠 `createArticleUnlocked_` 的函式簽名沒有 `lock` 參數在結構上保證的,不需要另外寫一支追蹤取鎖次數的測試來驗證)
- 呼叫 LINE API 下載圖片內容、取得群組成員 `displayName` 的 `UrlFetchApp` 呼叫
- 每日 trigger 安裝函式(含防重複檢查)

## Out of Scope

- 不建立看板管理功能——看板必須已經存在,本次不新增、不修改任何看板本身的設定,`LineGroupBoards` 對應表需由管理者手動維護、確保指向的看板存在。
- 不建立 SYSTEM 的使用者帳號,也不讓 SYSTEM 進入角色權限或排行榜體系。
- 不把暫存資料當作長期歷史保存,不建立獨立於暫存資料生命週期之外、能跨越文章張貼動作存活的去重紀錄。
- 不回頭修改已經張貼出去的文章內容,即使對應的原始訊息後來被收回。
- 不記錄群組成員加入/退出等系統事件,不儲存貼圖/影片/語音/檔案/位置的實際內容,只記錄固定文字註記。
- 不做 LINE webhook 請求來源的簽章驗證(見 Implementation Decisions,明確攻擊面已列出並接受)。
- 不處理「群組對應的看板被刪除/改名」的主動防呆或告警機制,沿用既有「找不到看板就安靜略過」行為。
- 不做正式的 rollback 策略;如需停用,移除 LINE Developers Console 的 webhook 設定或清空對應 Script Properties 憑證即可讓 `doPost` 端點停止實際接收新事件,不影響既有 BBS 網站功能。

## Further Notes

**部署後管理者需要手動完成的設定**(這些是操作步驟,不是程式碼異動範圍):
1. 部署方式維持既有慣例:手動貼上 Apps Script 編輯器,不是 `clasp push`。
2. 這次新增權限範圍(webhook 相關網路存取),重新部署會再跳出一次授權畫面,需要同意才能完成部署。
3. 在 Script Properties 填入 `LINE_CHANNEL_ACCESS_TOKEN`(已持有憑證)。
4. 在 `LineGroupBoards` 工作表手動登記要授權的 LINE 群組與各自對應的看板(看板需已存在於 `Boards` 分頁)。
5. 在 LINE Developers Console 把該 Channel 的 webhook URL 指向部署後的 Web App `/exec` 網址。
6. 在 Apps Script 編輯器手動執行一次 trigger 安裝函式,建立每日 00:05(Asia/Taipei)的換日檢查 trigger(這次已加上重複執行防呆,不會建立出多個重複 trigger)。

**沒有討論過資料回填或既有資料遷移的需求**——這次變更是全新能力,不涉及既有 `Users`/`Boards`/`Articles`/`Replies`/`Permission` 資料的修改或轉換。

**跟先前 openspec 探索文件(`linebotspec`/`linebotcode`)的關係**:那批文件的訪談方向與大部分技術決策在這份 spec 裡被沿用(範圍不變,見 grilling 紀錄 Q1/Q2),但 round 3 新增的 `Permission`/`AllowRoles` 系統當時完全沒有被考慮到(見「SYSTEM 發文」段落的 `AllowRoles` 繞過決定,這是新確認的);另外兩處先前標記為「已知風險、留給人工驗證」的項目(巢狀取鎖、換日序號雙重比對)這次都在設計階段直接解掉,不需要再排進部署後的手動驗收清單。後續 `/to-tickets` 產出的 `MANUAL_VERIFICATION.md` 追加項目只需要涵蓋這份 spec 實際會發生風險的地方(例如 LINE webhook 的真實格式是否跟預期一致、真實環境下 trigger 是否確實每天觸發),不需要重演這兩項已經在程式碼層面消除的不確定性。
