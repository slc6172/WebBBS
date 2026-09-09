# 03 — 圖片排序按鈕（三表單）

**What to build:** 桌面發文、手機發文、編輯文章三個表單裡，已選圖片的縮圖各自加上「往前移」「往後移」按鈕，使用者可以在送出前調整圖片顯示順序，不用刪掉重加。三個表單行為完全一致（桌面、手機不做差異化）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `renderImageListHtml(list, addFnName, removeFnName)` 新增一個移動用的回呼參數（例如 `moveFnName`），三個呼叫端（桌面發文、手機發文、編輯文章）都要傳入
- [ ] 每個縮圖旁顯示「往前移」「往後移」兩個按鈕，點擊時對該表單自己的圖片陣列（`newArticleImageList`／`mobileNewArticleImageList`／`editImageList`）做相鄰元素交換後重新渲染
- [ ] 第一張的「往前移」按鈕、最後一張的「往後移」按鈕停用（`disabled`），比照現有分頁按鈕在邊界停用的視覺與互動模式
- [ ] 不實作真正的拖曳手勢（HTML5 native drag-and-drop 在行動裝置支援不佳，不採用）
- [ ] 送出流程（`postArticleFromForm`／`editArticleFromForm`）不需要任何改動——重新排序後的陣列原封不動送出，沿用既有的 `resolveImageSlots`／session 上傳連結驗證邏輯
- [ ] 純前端邏輯，沒有對應的 Node 測試 seam；`MANUAL_VERIFICATION.md` 新增這張票的真人環境驗收項目（三個表單各測一次移動與邊界停用，並確認送出後圖片順序正確反映在已發布/已編輯的文章上）
