# 02 — Boards.AllowRoles 看板分眾基礎建設

**What to build:** 讓管理者可以針對單一看板疊加一層角色限制,即使某個角色本身有全域讀取權限,還要通過該看板的 `AllowRoles` 才能真的存取。這張唯一使用者看得到的行為變化是看板下拉選單開始套用這個過濾。

**Blocked by:** 01

**Status:** done

- [x] `Boards` 工作表新增 `AllowRoles` 欄位(schema 定義)
- [x] 偵測到這是第一次新增這個欄位時,把當下所有既有看板列的 `AllowRoles` 自動補成 `ALL`,確保部署當下所有看板的可見性維持不變
- [x] 欄位已經存在後,重複執行不再自動補值——之後新增的看板列留空就是留空,不會被程式自動腦補
- [x] 有一支函式能依角色 + 看板判斷是否允許存取:
  - `AllowRoles` 空白 → 只有 admin 允許
  - 填 `ALL`(大小寫不分)→ 只要角色本身通過對應的全域權限即允許,不額外限制
  - 逗號分隔的角色清單 → 只有清單內的角色允許

  實作為 `boards.js` 的 `boardAllowsRole(allowRolesValue, role)`,刻意做成不碰 spreadsheet 的純函式,搭配 `listBoards` 既有的整批讀取重複使用,不新增額外的個別看板讀取
- [x] admin 角色一律允許,不查 `AllowRoles` 欄位內容——這個判斷放在呼叫端(`getBoardsForRole`),不是 `boardAllowsRole` 內部,比照既有 `deleteArticle.js`/`editArticle.js` 的 `isAdmin` 特例寫法
- [x] 看板列表查詢同時套用角色的全域「文章讀」權限與該看板的 `AllowRoles`,兩者都通過的看板才會出現在清單中——`getBoardsForRole` 的全域門檻也一併從寫死的 `['user','admin']` 換成查 `Permission` 表
- [x](追加,ticket 內容外但屬於同一條路徑的資安修正)`Code.js` 的 `getBoardsFromToken` 另一處寫死 `gateByRole(role, ['user','admin'])` 一併換成動態權限查詢——這處原本判斷失敗時會直接回傳未經欄位白名單過濾的原始看板陣列,`listBoards` 開始帶 `allowRoles` 欄位後,舊寫法會讓這個內部欄位外洩到前端回應

