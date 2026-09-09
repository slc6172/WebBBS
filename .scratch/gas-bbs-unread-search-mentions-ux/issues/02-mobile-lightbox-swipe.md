# 02 — 手機燈箱滑動切圖

**What to build:** 手機使用者在燈箱（放大檢視文章圖片）裡，左右滑動就能切換到上一張/下一張圖片，不用關掉燈箱重新點縮圖。行為跟桌面版既有的鍵盤左右鍵切圖（`navigateLightbox_`）完全對應：左滑＝下一張、右滑＝上一張；滑到第一張再右滑、或最後一張再左滑，不做任何動作（不跳圖、不回彈動畫），跟鍵盤邊界行為一致。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 燈箱的 overlay／圖片元素上新增觸控滑動手勢偵測（`touchstart`／`touchmove`／`touchend`），沿用既有手機文章滑動所使用的同一套水平位移門檻與垂直容許誤差比例常數
- [ ] 偵測到的水平滑動呼叫既有的 `navigateLightbox_(direction)`：左滑呼叫下一張方向、右滑呼叫上一張方向，跟鍵盤 ArrowRight/ArrowLeft 的方向映射一致
- [ ] 第一張時右滑、最後一張時左滑，`navigateLightbox_` 邊界行為維持不動作（沿用既有函式邊界邏輯，不需新增判斷）
- [ ] 處理 `touchend` 之後瀏覽器可能補發的合成 `click` 事件，確保一次滑動手勢不會被同時誤判成「點擊背景關閉燈箱」
- [ ] 純前端邏輯，沒有對應的 Node 測試 seam；`MANUAL_VERIFICATION.md` 新增這張票的真人環境驗收項目（含 iOS／Android 各測一次滑動方向與邊界行為，以及滑動不會誤觸關閉）
