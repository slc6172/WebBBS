const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 第 16 輪（跨頁背景工作狀態提示）：Index.html 屬於前端 glue，專案慣例不寫自動化測試。
// 但「可重入計數器」這段邏輯一旦漏掉 -1 提示就會永遠卡住，所以把它寫成不碰 DOM 的
// 純函式（夾在 BEGIN/END 標記之間），在這裡用假計時器直接驗證；畫面層仍靠手動驗收。

function loadTracker() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  const start = html.indexOf('// BEGIN backgroundTaskTracker');
  const end = html.indexOf('// END backgroundTaskTracker');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const code = html.slice(start, end);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.createBackgroundTaskTracker_ = createBackgroundTaskTracker_;', ctx);
  return ctx.createBackgroundTaskTracker_;
}

function setup() {
  const create = loadTracker();
  let now = 0;
  let nextId = 1;
  const timers = {};
  const renders = [];
  const tracker = create({
    setTimeout: function (fn, ms) { const id = nextId++; timers[id] = { fn: fn, at: now + ms }; return id; },
    clearTimeout: function (id) { delete timers[id]; },
    render: function (state) { renders.push(state); }
  });
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const due = Object.keys(timers).filter(function (id) { return timers[id].at <= target; })
        .sort(function (a, b) { return timers[a].at - timers[b].at; });
      if (due.length === 0) break;
      const id = due[0];
      now = timers[id].at;
      const fn = timers[id].fn;
      delete timers[id];
      fn();
    }
    now = target;
  }
  function last() { return renders[renders.length - 1]; }
  return { tracker: tracker, advance: advance, renders: renders, last: last, pending: function () { return Object.keys(timers).length; } };
}

test('a task that finishes quickly never shows anything (fast operations keep their current lightweight feedback)', () => {
  const t = setup();
  const task = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(300);
  task.done();
  t.advance(5000);
  expect(t.renders).toEqual([]);
  expect(t.pending()).toBe(0);
});

test('a slow task shows the running state after the delay, then a brief success state, then hides', () => {
  const t = setup();
  const task = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(600);
  expect(t.last()).toEqual({ visible: true, mode: 'running', text: '圖片上傳中…' });
  task.done();
  expect(t.last()).toEqual({ visible: true, mode: 'success', text: '完成' });
  t.advance(1300);
  expect(t.last().visible).toBe(false);
  expect(t.pending()).toBe(0);
});

test('stays visible until ALL concurrent tasks finish, not when the first one does', () => {
  const t = setup();
  const a = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  const b = t.tracker.begin('載入文章中…', '載入文章失敗');
  t.advance(600);
  expect(t.last()).toEqual({ visible: true, mode: 'running', text: '背景作業進行中（2）' });
  a.done();
  expect(t.last().mode).toBe('running');
  expect(t.last().visible).toBe(true);
  b.done();
  expect(t.last().mode).toBe('success');
});

test('a failure is shown in a visibly different state, with the failed task\'s own text, and lasts longer', () => {
  const t = setup();
  const task = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(700);
  task.fail();
  expect(t.last()).toEqual({ visible: true, mode: 'failure', text: '圖片上傳失敗' });
  t.advance(1300);
  expect(t.last().visible).toBe(true);
  t.advance(3000);
  expect(t.last().visible).toBe(false);
});

test('if one of several concurrent tasks fails, the final state is failure even though the others succeeded', () => {
  const t = setup();
  const a = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  const b = t.tracker.begin('載入文章中…', '載入文章失敗');
  t.advance(700);
  a.fail();
  expect(t.last().mode).toBe('running');
  b.done();
  expect(t.last().mode).toBe('failure');
});

test('a task that fails before the indicator was ever shown stays silent (the existing failure toast already covers it)', () => {
  const t = setup();
  const task = t.tracker.begin('載入文章中…', '載入文章失敗');
  t.advance(100);
  task.fail();
  t.advance(5000);
  expect(t.renders).toEqual([]);
});

test('calling done/fail more than once on the same task never double-decrements (counter cannot go negative or hide early)', () => {
  const t = setup();
  const a = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  const b = t.tracker.begin('載入文章中…', '載入文章失敗');
  t.advance(700);
  a.done();
  a.done();
  a.fail();
  expect(t.last().mode).toBe('running');
  expect(t.last().visible).toBe(true);
  b.done();
  expect(t.last().mode).toBe('success');
});

test('a task that is never finished keeps the indicator visible, which is why every call site must end its task on every path', () => {
  const t = setup();
  t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(600000);
  expect(t.last()).toEqual({ visible: true, mode: 'running', text: '圖片上傳中…' });
});

test('starting a new task while the success/failure state is showing switches straight back to running and cancels the pending hide', () => {
  const t = setup();
  const a = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(700);
  a.done();
  expect(t.last().mode).toBe('success');
  const b = t.tracker.begin('載入文章中…', '載入文章失敗');
  expect(t.last()).toEqual({ visible: true, mode: 'running', text: '載入文章中…' });
  t.advance(5000);
  expect(t.last().mode).toBe('running');
  expect(t.last().visible).toBe(true);
  b.done();
  expect(t.last().mode).toBe('success');
});

test('an earlier failure does not leak into a later, unrelated batch of tasks', () => {
  const t = setup();
  const a = t.tracker.begin('圖片上傳中…', '圖片上傳失敗');
  t.advance(700);
  a.fail();
  const b = t.tracker.begin('載入文章中…', '載入文章失敗');
  b.done();
  expect(t.last().mode).toBe('success');
});
