# 07 — 深連結補讀 fallback

**What to build:** 使用者透過分享出來的連結(`?board=xxx&article=xxx`)直接開啟一篇文章,而這篇文章不在目前已經批量載入的頁次範圍內時(不論是全新進入看板、或還沒點過「載入更早的文章」),系統改呼叫既有的單篇文章詳情端點(`getArticleDetailFromToken`,含既有的版本比對邏輯,不做任何修改)把這篇文章的完整內容與回覆補讀回來,直接顯示,不需要使用者先把整個看板從頭批次載完。

**Blocked by:** 05 — 看板批量預載端點與前端串接(單頁)

**Status:** ready-for-agent

- [x] 帶著 `?board=xxx&article=xxx` 網址參數載入頁面時,前端先檢查這篇文章是否已經在目前記憶體裡已載入的頁次範圍內——`loadArticleDetail` 一律先呼叫 `findCachedArticleLocation_`(ticket 05 已完成,跨所有已載入頁次搜尋)
- [x] 不在已載入範圍內時,呼叫既有的 `getArticleDetailFromToken` 端點取得這篇文章的完整內容與回覆,直接顯示,不觸發整個看板的批量載入——`getArticleDetailFromToken` 本身(Code.js)自 ticket 03 之後未再改動;fallback 分支完全不呼叫 `loadArticles`/`getBoardBulkFromToken`
- [x] 已經在已載入範圍內時(例如剛好是最新一批裡的文章),直接從記憶體快取渲染,不呼叫任何伺服器端點——`located` 分支沿用 ticket 05 的既有行為,不變
- [x] 透過這個 fallback 補讀到的單篇文章,不會被誤植進批量快取的頁次結構裡,不影響之後「載入更早的文章」的頁次判斷——fallback 分支只寫入 `lastArticleDetail`,完全不觸碰 `boardBulkCache`
- [x] 這篇文章所屬的看板本身如果不在使用者當下允許瀏覽的看板清單內,一樣顯示現有的「找不到這篇文章,或您沒有權限檢視」訊息,行為與現況一致——重用既有的「文章不存在或已被刪除」字串(查證過這是目前程式碼裡實際的既有文字,不是另外發明的新訊息),找不到與沒有權限兩種情況刻意顯示同一句話,呼應 `getArticleDetailForSnapshot` 既有的「不透露原因」設計
- [x] 使用者從這篇透過深連結補讀到的文章,再回到看板列表繼續瀏覽其他文章時,恢復使用批量載入的記憶體資料渲染,不受這次單篇補讀影響——由結構保證:fallback 不寫入任何持久狀態,下一次點擊清單裡的文章一樣會先命中 `findCachedArticleLocation_`,不需要額外程式碼處理「恢復」
