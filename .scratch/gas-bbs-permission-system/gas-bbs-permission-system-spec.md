status: ready-for-agent

# GAS BBS 權限系統改造 — Permission 工作表 + Boards.AllowRoles

## Problem Statement

目前系統的角色只有 `newbie`/`user`/`admin` 三種,而且每一種角色能做什麼事,是寫死在程式碼裡的字串陣列(例如 `gateByRole(role, ['user', 'admin'])`),散落在十幾個檔案裡。管理者(使用者本人)如果想要:

- 定義一種新角色(例如未來的「已停權」角色)
- 調整某個角色能不能刪自己的回覆
- 讓某些看板只對特定角色開放(內容分眾)

目前完全沒辦法透過操作 Google Sheets 做到,每一次都得回頭改程式碼、重新部署。角色的「種類」跟「權限」目前也沒有任何一個地方能一眼看全,得翻遍原始碼才知道某個角色到底能做什麼。

## Solution

新增一張 `Permission` 工作表,把「有哪些角色」「每個角色有哪 8 種權限」變成資料,而不是程式碼。管理者以後要新增角色、調整某個角色的權限,直接在 Sheets 裡編輯這張表即可生效,不用改程式碼、不用重新部署。

同時在 `Boards` 工作表新增 `AllowRoles` 欄位,讓管理者可以針對「單一看板」再疊加一層限制——即使某個角色本身有「看板文章讀」這種全域權限,還要看這個角板的 `AllowRoles` 有沒有把這個角色放進來,才能真的看到/操作這個看板底下的內容,達成內容分眾的效果。

## User Stories

### Permission 工作表 — 角色與權限的資料化

1. As an admin,我想要在 `Permission` 工作表裡看到目前系統有哪些角色、每個角色各自有哪些權限,這樣我不用翻程式碼就能一眼看懂整套權限設計。
2. As an admin,我想要新增一列自訂角色(例如未來的 `reject`,代表被拒絕使用的帳號),並直接勾選這個角色能不能做每一種動作,系統就會照著這個設定生效,不需要工程師改程式碼。
3. As an admin,我想要調整某個既有角色(例如 `user`)的某一項權限(例如「回覆刪除本人」),存檔後下一次任何人操作系統就會立刻套用新規則,不用等重新部署。
4. As a developer(未來接手這個專案的人),我想要 `Users.role` 欄位有資料驗證下拉選單,選項直接來自 `Permission` 工作表的角色清單,這樣手動改角色時不會因為打錯字讓某個使用者悄悄變成「沒有任何權限的未知角色」。
5. As the system,當有人的 `role` 是一個 `Permission` 表裡不存在的字串(例如打錯字、或角色列被刪掉了),我要讓這個人的所有權限一律視為沒有,不報錯、不特殊處理,安全地退回到最保守的狀態。

### 8 種可設定的權限

6. As a `user`,我想要能讀取有權限的看板裡的文章列表與內容。
7. As a `user`,我想要能在有權限的看板發表新文章。
8. As a `user`,我想要能編輯、刪除我自己發表過的文章。
9. As a `user`,我想要能讀取文章底下的回覆。
10. As a `user`,我想要能對文章發表回覆。
11. As a `user`,我想要能刪除我自己發表過的回覆(這是這次新增的能力,原本規則是任何人都不能刪自己的回覆,這次改成可以透過 `Permission` 表設定開放)。
12. As a `user`,我想要能看排行榜(登入次數/發文數/回覆數)。
13. As a registered account,我想要能登入系統(前提是我的角色被允許登入)。
14. As an admin,我想要不受上述「本人」限制,能編輯、刪除任何人的文章,能刪除任何人的回覆——這個能力這次確認維持寫死在程式碼裡,不放進 `Permission` 表,也不會受 `Boards.AllowRoles` 限制。
15. As a `newbie`(剛註冊、還沒被審核的帳號),我想要能重複登入查看自己目前是什麼狀態,但在角色被改成 `user`/`admin` 之前,看不到任何看板或文章內容——這是既有行為,這次延續不變,只是改成由 `Permission` 表定義(newbie 只有「登入」是 TRUE,其餘 7 項全部 FALSE)。
16. As an admin,如果我未來把某個帳號的角色改成一個所有 8 項權限都是 FALSE 的角色(例如未來要新增的 `reject`),我想要這個帳號連登入都不行,並且看到的錯誤訊息跟「密碼打錯」完全一樣,不要讓對方知道自己是被角色擋下來的。
17. As an admin,我想要角色被拒絕登入這件事,不要去消耗現有「15 分鐘內密碼錯 5 次鎖定帳號」的失敗次數,因為這是兩種不同的拒絕原因,不應該共用同一個計數器(否則被拒絕登入的帳號可能被外部一直嘗試,反而先把自己鎖住)。

### Boards.AllowRoles — 看板層級的分眾限制

18. As an admin,我想要在 `Boards` 工作表新增 `AllowRoles` 欄位,針對特定看板限制哪些角色看得到/能操作,即使這些角色本身有全域的看板讀取權限。
19. As an admin,我想要 `AllowRoles` 留空時代表「除了 admin 以外沒有任何角色看得到這個看板」,這樣我新增一個尚未設定好的看板時,不會不小心讓還沒準備好的內容曝光。
20. As an admin,我想要在 `AllowRoles` 填入 `ALL`(大小寫不分)時,代表「只要角色本身有對應的全域權限就看得到,不額外限制」,這樣不需要分眾的看板,我不用一個一個把角色名稱都打進去。
21. As an admin,我想要在 `AllowRoles` 填入逗號分隔的角色清單(例如 `user,admin`)時,只有清單內的角色才能存取這個看板。
22. As a `user`,如果我不在某個看板的 `AllowRoles` 名單裡,我想要這個限制同時套用在讀取文章、讀取回覆、發表文章、發表回覆、編輯刪除自己的文章、刪除自己的回覆這 6 種看板內動作上——只要我進不去這個看板,裡面任何操作(包含對我自己以前發過的內容)都不能做,不要有例外或不一致的規則。
23. As an admin,我想要 admin 角色完全不受任何看板的 `AllowRoles` 限制,不需要特地把 `admin` 填進每個看板的清單裡,也能存取所有看板的所有內容。
24. As a user 想直接用網址 `?board=xxx` 深連結到一個看板,如果我的角色被那個看板的 `AllowRoles` 擋下來,我想要系統一樣拒絕我存取,不能因為我知道 boardId 就繞過限制。

### 前端 UI 同步

25. As a `user`,我想要「發表新文章」按鈕只在我真的有「文章發表」權限、而且目前看板的 `AllowRoles` 也允許我時才出現,不要讓我點了才被後端拒絕。
26. As a `user`,我想要排行榜按鈕只在我有「排行榜」權限時才出現。
27. As a `user`,我想要文章的編輯/刪除按鈕,只在我是 admin,或者我有「文章編輯刪除(本人)」權限且這篇文章是我自己發的,才出現。
28. As a `user`,我想要回覆的刪除按鈕,只在我是 admin,或者我有「回覆刪除(本人)」權限且這則回覆是我自己發的,才出現。
29. As a developer,我想要這些前端判斷都是根據後端回傳的即時權限資料動態決定,而不是像現在一樣把 `role === 'user' || role === 'admin'` 這種字串寫死在 `Index.html` 裡,這樣以後新增/調整角色不需要同步改前端程式碼。

### Migration 與部署安全性

30. As an admin,我想要這次部署完成後,系統不會因為 `Permission` 表是空的而瞬間鎖死(所有人任何事都做不了),第一次啟用時要自動把「目前實際上的行為」寫成預設值。
31. As an admin,我在 `Permission` 表手動調整過設定之後,不希望系統之後又把我的設定悄悄改回預設值——不管我重新整理頁面幾次都一樣,一旦這張表有資料,系統就不該再自動覆寫它。
32. As an admin,我想要這次部署完成後,我現有的所有看板都維持「原本所有 user/admin 都能看到」的行為,不會因為新增了 `AllowRoles` 這個空白欄位,就讓所有看板瞬間變成「除了我自己以外沒人看得到」。
33. As an admin,我想要上述兩個自動預設值只在「第一次」發生(表格從無到有的那一刻),之後我新增的角色或新增的看板,系統不會自動幫我腦補權限或 `AllowRoles`,要我自己決定並填寫。

## Implementation Decisions

### Permission 工作表結構

- 新增第 5 張工作表 `Permission`,加入 `schema.js` 的 `SHEET_HEADERS`。
- 結構:一列一個角色,欄位為 `role` + 8 個布林值權限欄:`articleRead`、`articlePost`、`articleManageOwn`、`replyRead`、`replyPost`、`replyDeleteOwn`、`leaderboard`、`login`。
- `Permission` 表是「哪些角色合法」的唯一真相來源——角色清單就是這張表目前有哪些列(不含表頭)。

### Seed 保護機制(schema.js)

- `ensureSchema` 目前是每次 `doGet` 都會呼叫、且只覆寫表頭、從不動資料列的函式,這次沿用同樣的「表頭每次覆寫、資料只在必要時動一次」精神,但 `Permission` 表跟 `Boards.AllowRoles` 各需要一次性的初始資料寫入,否則會出現「表是空的等於全站鎖死」或「AllowRoles 空白等於看板瞬間消失」的問題。
- **Permission 表**:`ensureSchema` 寫完表頭後,檢查這張表目前有沒有超過表頭的資料列。如果沒有(全新的表),寫入三列預設值:
  - `newbie`:僅 `login = TRUE`,其餘 7 項 `FALSE`
  - `user`:8 項全部 `TRUE`
  - `admin`:8 項全部 `TRUE`
  
  只要偵測到已經有資料列存在(不論內容為何),完全不再動這張表,不論之後 `ensureSchema` 被呼叫幾次。
- **Boards.AllowRoles**:偵測「這是不是第一次幫 `Boards` 表加上這個欄位」(比對目前表頭跟新表頭的差異)。如果是第一次新增這欄,把當下所有既有看板列的 `AllowRoles` 統一補成 `ALL`。之後偵測到這欄已存在,不再自動補值——之後新增的看板列留空,就照 Q4 的語意處理(除 admin 外沒人看得到),需要管理者自行決定要不要填。

### `permissions.js` 擴充(核心權限查詢邏輯所在的既有 seam)

- 新增讀取 `Permission` 表、依角色回傳 8 項權限布林值的函式(role → permission map)。
- 新增一個以「權限名稱」為單位的檢查函式,取代現在散落各處、直接寫死角色陣列的 `gateByRole(role, ['user', 'admin'])` 呼叫方式,改成查 `Permission` 表對應欄位。
- 既有的 `gateByRole(role, allowedRoles)` 原始函式保留不變(單純的陣列比對,仍有測試覆蓋),新的權限查詢函式在內部組出允許角色清單後,一樣透過這個原始函式做最終比對,盡量不動到已經穩定、有測試的部分。
- `getSessionRole` 不變,仍然是每次都重新查角色,不快取。

### AllowRoles 檢查邏輯(延伸既有的 `boards.js` seam)

- `boards.js` 的 `listBoards`/`getBoardsForRole` 讀取新增的 `AllowRoles` 欄位,`getBoardsForRole` 除了原本的全域「文章讀」權限檢查外,對每個看板額外判斷該角色是否通過這個看板的 `AllowRoles`(空白=僅 admin、`ALL`=不限制、逗號清單=只有清單內角色),回傳的看板列表只保留兩者都通過的看板。
- 這個「角色是否通過某看板的 AllowRoles」判斷,需要在 `articles.js`(`getArticlesForRole`、文章詳情查詢)、`postArticle.js`、`postReply.js`、`editArticle.js`、`deleteArticle.js`、`deleteReply.js` 裡,凡是「動作對象隸屬於某個特定看板」的地方都重新檢查一次——不能只靠「看板列表裡有沒有這個看板」來把關,因為既有的深連結(`?board=` 網址參數)跟直接呼叫 `google.script.run` 都可能繞過看板列表,直接指定 boardId/articleId 操作。
- admin 角色在這個判斷裡永遠直接放行,不查 `AllowRoles` 欄位內容。

### 各動作的權限來源(全部從寫死陣列改成查 `Permission` 表 + 視情況疊加 AllowRoles)

| 動作 | 原本 | 這次 |
|---|---|---|
| 看板列表 / 文章列表讀取 | `['user','admin']` 寫死 | `articleRead` 權限 + 該看板 `AllowRoles` |
| 發表文章 | `['user','admin']` 寫死 | `articlePost` 權限 + 該看板 `AllowRoles` |
| 編輯/刪除自己的文章 | `['user','admin']` 寫死 + ownership 檢查 | `articleManageOwn` 權限 + ownership + 該看板 `AllowRoles`;admin 繞過 ownership 與 AllowRoles(寫死,不查表) |
| 回覆讀取 | 跟隨文章讀取 | `replyRead` 權限 + 該看板 `AllowRoles` |
| 發表回覆 | `['user','admin']` 寫死 | `replyPost` 權限 + 該看板 `AllowRoles` |
| 刪除自己的回覆 | 完全不可能(僅 admin 可刪,無 ownership 分支) | 新增 ownership 檢查(比照 `deleteArticle.js` 既有寫法),`replyDeleteOwn` 權限 + ownership + 該看板 `AllowRoles`;admin 繞過 ownership 與 AllowRoles(寫死) |
| 排行榜檢視 | `['user','admin']` 寫死 | `leaderboard` 權限,與看板無關,不查 `AllowRoles` |
| 登入 | 無角色檢查,只驗密碼 | 密碼驗證通過後,額外檢查 `login` 權限;失敗時回傳跟密碼錯誤完全相同的錯誤訊息,且不計入既有「15 分鐘 5 次」鎖定計數 |

- 「編輯回覆」這個功能這次確認不做,`Permission` 表也不會有對應項目,只有刪除。
- 回覆的 `author` 欄位目前的讀取函式已經有取得,新增 ownership 檢查是延伸既有欄位,不需要改 `Replies` 的 schema。

### admin 越權能力(維持寫死,不進 `Permission` 表)

- 編輯/刪除他人文章、刪除任何人的回覆,這個能力繼續用 `role === 'admin'` 的字面判斷式,不受 `Permission` 表或 `AllowRoles` 控制,是整個系統唯一保留的特例。
- 在 `permissions.js` 開頭與 `Permission` 表本身(以額外註解列或欄位說明的形式)留下文字,明確標註這個例外不受此表控管,避免後續維護者誤以為改表就能調整這個能力。

### `Users.role` 資料驗證

- 對 `Users` 工作表的 `role` 欄套用 Google Sheets 資料驗證(下拉選單),選項來源動態讀取 `Permission` 表目前的角色清單。

### 前端(`Index.html`)

- `getMyStatus`(或等效的狀態查詢函式)回傳內容新增一組權限物件,包含這次的 8 項權限的布林值,供前端使用。
- 取代原本 3 處寫死的角色字串判斷:
  - 發文按鈕(桌面版/手機版浮動鈕)→ 依 `articlePost` 權限(且拆開了原本跟排行榜按鈕共用的同一個判斷式,兩者現在是獨立權限)
  - 排行榜按鈕 → 依 `leaderboard` 權限
  - 文章編輯/刪除按鈕 → admin 或(`articleManageOwn` 權限 + 本人)
  - 回覆刪除按鈕 → admin 或(`replyDeleteOwn` 權限 + 本人)
- 看板下拉選單本身已經是後端過濾(全域權限 + AllowRoles)後的結果,前端不需要對「目前選取的看板」再額外做一次 AllowRoles 判斷。
- 這些前端判斷都只是 UX 優化,後端每一支 `*FromForm` 函式仍然會各自重新檢查一次權限,不因為前端有沒有顯示按鈕而改變安全性——這是這個專案從第一輪就有的既有原則,這次延續。

### register.js

- 新使用者註冊預設角色維持寫死字串 `'newbie'`,這次不改動、不做成可設定項目。

## Testing Decisions

- 延續本專案既有慣例:每個 `src/*.js` 純函式模組走完整 TDD 紅綠循環,前端 `Index.html` 邏輯不寫自動化測試,靠使用者在真實 GAS 環境手動驗收(`MANUAL_VERIFICATION.md`)。
- 好的測試只驗證外部行為(給定角色的權限狀態 + 看板 AllowRoles 組合,某個動作允許或拒絕),不去斷言內部怎麼查表、怎麼組陣列。
- 重點測試模組與案例:
  - `schema.js`:`Permission` 表首次建立時的 seed 內容正確;已有資料時重複呼叫 `ensureSchema` 不會覆寫既有資料(呼叫兩次,中間手動改一個值,確認第二次呼叫後改的值還在)。`Boards.AllowRoles` 首次新增欄位時既有列補成 `ALL`;欄位已存在時重複呼叫不覆寫。
  - `permissions.js`:各角色 × 各權限項目的查詢結果正確;角色不存在於 `Permission` 表時,所有權限一律回傳 false;既有 `gateByRole` 原始函式行為不變(既有 3 個測試須維持全綠)。
  - `boards.js`:`AllowRoles` 為空白/`ALL`(含大小寫混用)/逗號清單三種情況下,各角色能否看到該看板的結果正確;admin 不受 `AllowRoles` 影響。
  - `articles.js`/`postArticle.js`/`postReply.js`/`editArticle.js`/`deleteArticle.js`/`deleteReply.js`:針對「有全域權限但被該看板 AllowRoles 擋下」「有全域權限也通過 AllowRoles」「沒有全域權限」三種組合分別驗證;`deleteReply.js` 新增的 ownership 檢查(本人可刪/非本人不可刪/admin 可刪任何人的);URL/直接呼叫繞過看板列表、指定不可存取的 boardId/articleId 時仍被正確拒絕。
  - `login.js`:密碼正確但角色 `login` 權限為 false 時,回傳訊息與密碼錯誤時完全一致;這種情況不增加失敗次數鎖定計數(需確認鎖定計數的既有邏輯完全沒被觸發)。
- 沿用既有的 `test/doubles/fakeSpreadsheet.js` 等測試替身,不需要新增新的測試替身類型(`Permission`/`Boards` 都是既有 fake 已經支援的一般試算表分頁)。

## Out of Scope

- 回覆編輯功能(這次確認不做,只有回覆刪除本人這一項是新能力)。
- 把 admin 的「編輯刪除他人內容」能力也做成可透過 `Permission` 表設定(這次確認維持寫死)。
- 新增實際的 `reject`(或其他新角色)資料列本身——這次只確保架構撐得住,實際新增這個角色是使用者之後自行在 `Permission` 表操作,不需要程式改動。
- 角色的視覺化管理介面(例如網頁上的角色編輯 UI)——這次維持「管理者直接在 Google Sheets 編輯 Permission/Boards 兩張表」的既有慣例(跟 Boards 表本身從第一輪開始就沒有網頁編輯介面的原則一致)。
- 回填/遷移「舊資料」的角色或看板權限以外的內容(不涉及本次改動)。

## Further Notes

- 這是延續「優化輪」之後的第三輪改動,`gas-bbs-updated.zip` 目前的最新狀態(含回覆換行、圖片縮圖裁切兩個小修正)是這次改動的起點。
- 這次改動觸及的檔案範圍較廣(`schema.js`、`permissions.js`、`boards.js`、`articles.js`、`postArticle.js`、`postReply.js`、`editArticle.js`、`deleteArticle.js`、`deleteReply.js`、`login.js`、`Code.js`、`Index.html`,以及對應的測試檔案),建議透過 `/to-tickets` 拆成多張 vertical-slice ticket 分批用 `/tdd` 實作,而不是一次性的大改動。
- 部署方式維持手動貼上 Apps Script 編輯器,這次新增的 `Users.role` 資料驗證下拉選單是 Google Sheets 原生功能,需要程式碼在 `ensureSchema`(或另一個初始化流程)裡透過 `setDataValidation` 設定,不是手動在 Sheets UI 操作。
- Sandbox 開發環境沒有 Google OAuth 存取權限,這次改動一樣需要使用者在真實 GAS 環境手動驗收,尤其是 `Permission`/`Boards.AllowRoles` 這種「舊資料自動補值」的一次性 migration 邏輯,只有在使用者現有的、已經有真實資料的試算表上測試,才能真正驗證「不會破壞現有行為」這件事。
