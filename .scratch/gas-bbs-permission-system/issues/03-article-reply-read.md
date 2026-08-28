# 03 — 文章與回覆讀取權限

**What to build:** 文章列表、單篇文章內容、回覆列表,各自依角色對應的權限（文章讀 / 回覆讀）決定看不看得到，同時套用該看板的 `AllowRoles`。就算直接改網址參數或用瀏覽器 console 呼叫、繞過看板下拉選單，一樣要被正確擋下。

**Blocked by:** 01, 02

**Status:** done

- [x] 看板文章列表依角色的「文章讀」權限 + 該看板 `AllowRoles` 決定是否回傳實際資料，不符合時回傳空結果——`articles.js` 的 `getArticlesForRole`
- [x] 單篇文章內容依角色的「文章讀」權限 + 該看板 `AllowRoles` 決定是否回傳
- [x] 該篇文章底下的回覆列表獨立依角色的「回覆讀」權限 + 該看板 `AllowRoles` 決定是否回傳，跟文章內容的判斷分開計算——`articleDetail.js` 的 `getArticleDetailForRole` 拆成兩個獨立門檻，允許「看得到文章但看不到回覆」或反過來的組合，兩個方向都各有一條測試鎖住
- [x] 直接指定 boardId/articleId（不透過看板列表選取，例如網址深連結或直接呼叫後端函式）存取沒有權限的看板或文章時，一樣被正確拒絕——新增 `boards.js` 的 `boardAllowsRoleById`（board 查找 + admin 略過 + `boardAllowsRole` 的共用 I/O 包裝，後面 04~07 直接沿用）
- [x] 版本戳快取比對邏輯（避免整表重讀）在角色或 `AllowRoles` 造成的權限狀態改變時正確失效——`getArticlesFromToken`（boardId 本來就是參數，查該看板 `AllowRoles` 不貴，做到每次都是最新狀態）已完全正確；`getArticleDetailFromToken` 有一個經過討論並確認可接受的已知取捨，見下方說明

**已知取捨（討論後確認可接受，非遺漏）**：`getArticleDetailFromToken` 的版本快取捷徑，只即時檢查全域的 `articleRead` 權限，不即時檢查該文章所屬看板的 `AllowRoles`——要查看板得先讀出文章整列拿到 `boardId`，那正好是版本戳快取想避免的讀取動作，兩者衝突。真正精確的 `AllowRoles` 檢查落在 `getArticleDetailForRole` 本身（版本不符、或本來沒有快取版本、真的要重讀文章時才會發生，那種情況下反正就要付這個讀取成本）。代價：管理者剛把某看板的 `AllowRoles` 改成排除某角色時，若該角色瀏覽器裡剛好對該文章有命中的快取版本，要等版本被其他異動打掉（文章被編輯/刪除）或重新整理頁面才會真的生效，不是當下立即生效——已確認此代價可接受（權限調整頻率極低）。

