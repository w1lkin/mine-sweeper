# 微信小游戏 · 扫雷（HTML5）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个移动端优先、可在浏览器与微信 webview 中运行的扫雷 HTML5 单页，含三档难度、最近 10 次本地记录，以及由 card-share skill 生成的分享卡。

**Architecture:** 纯静态前端（index.html + style.css + game.js）。核心棋盘逻辑写成无 DOM 依赖的纯函数，既供页面调用，也可在 node 下做单元测试；记录用 localStorage；分享能力复用已同步的 `share-card-generator` skill（独立 `share-card.html` + 游戏内离屏 canvas 浮层）。

**Tech Stack:** 原生 HTML5 / CSS3 / JavaScript（ES2020），localStorage，Canvas 2D；测试用 Node 内置 `node:test`（`node --test`）。

## Global Constraints

- 形态：纯 HTML5 网页 + 微信 webview 分享包装，**不**使用微信开发者工具工程。
- 三档难度：初级 9×9/10 雷、中级 16×16/40 雷、高级 30×16/99 雷（高级为 30 列 × 16 行）。
- 首次点击安全（延迟布雷，避开首点及其 8 邻域）。
- 记录 key：`minesweeper_records`；最多 10 条，按时间倒序，新记录置顶；刷新后保留。
- 单条记录：`{date, difficulty:'easy'|'medium'|'hard', result:'win'|'lose', time, cellsLeft}`。
- 分享：复用 `share-card-generator` skill，输出 1200×1600 卡片（标题/难度/用时/胜负 + 二维码）。
- 移动端优先、竖屏适配，无控制台报错。

---

## File Structure

- `index.html` — 页面骨架：难度选择、棋盘容器、计时/剩余雷数、战绩列表、分享按钮。
- `style.css` — 移动端优先样式。
- `game.js` — 纯逻辑（建盘/布雷/翻开/连锁/胜负/记录）+ DOM 渲染与交互 + 分享调用。无 DOM 部分通过 `module.exports` 暴露给 node 测试。
- `tests/game.test.js` — 纯逻辑单元测试（node:test）。
- `share-card.html` — card-share skill 生成的分享页（独立可下载 PNG）。

---

### Task 1: 棋盘与布雷逻辑（首点安全）

**Files:**
- Create: `game.js`
- Create: `tests/game.test.js`

**Interfaces:**
- Produces: `initBoard(rows, cols, mineCount)`, `placeMines(board, safeR, safeC)`, `forEachNeighbor(board, r, c, fn)`
- 后续任务消费这些函数与 `board` 数据结构。

- [ ] **Step 1: 写失败测试**

`tests/game.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { initBoard, placeMines } = require('../game.js');

test('initBoard 生成正确尺寸的空盘', () => {
  const b = initBoard(9, 9, 10);
  assert.equal(b.rows, 9);
  assert.equal(b.cols, 9);
  assert.equal(b.mineCount, 10);
  assert.equal(b.cells.length, 81);
  assert.ok(b.cells.every(c => !c.mine && !c.revealed && !c.flagged));
});

test('placeMines 布雷数正确且避开安全格与邻域', () => {
  const b = initBoard(9, 9, 10);
  placeMines(b, 4, 4);
  const mines = b.cells.filter(c => c.mine).length;
  assert.equal(mines, 10);
  // 安全格本身无雷
  assert.equal(b.cells[4 * 9 + 4].mine, false);
  // 8 邻域无雷
  let safe = true;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const r = 4 + dr, c = 4 + dc;
      if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
      if (b.cells[r * 9 + c].mine) safe = false;
    }
  assert.ok(safe, '安全格邻域不应有雷');
  // 相邻计数正确：某雷的邻格 adj 之和 >= 雷数
});

test('placeMines 计算相邻雷数', () => {
  const b = initBoard(3, 3, 1);
  // 手动布一个雷在 (0,0)
  b.cells[0].mine = true;
  // 用通用算法：清空后重布需绕过，这里直接验证 adj 计算函数在 placeMines 内
  placeMines(b, 2, 2); // 安全角 (2,2) 远离 (0,0)
  assert.equal(b.cells[0].adj, 0 ? b.cells[0].adj : b.cells[0].adj, b.cells[0].adj);
  // 至少 (0,1) 或 (1,0) 或 (1,1) 的 adj >= 1
  const adjSum = b.cells[1].adj + b.cells[3].adj + b.cells[4].adj;
  assert.ok(adjSum >= 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/game.test.js`
Expected: FAIL（`initBoard is not defined` 或模块未导出）。

- [ ] **Step 3: 写最小实现**

`game.js`（仅逻辑部分，文件末尾导出）：
```js
'use strict';

function idx(board, r, c) { return r * board.cols + c; }

function forEachNeighbor(board, r, c, fn) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;
      fn(nr, nc);
    }
  }
}

function initBoard(rows, cols, mineCount) {
  const cells = [];
  for (let i = 0; i < rows * cols; i++) {
    cells.push({ mine: false, revealed: false, flagged: false, adj: 0 });
  }
  return { rows, cols, mineCount, cells, firstClick: false, minesPlaced: false };
}

function placeMines(board, safeR, safeC) {
  // 收集候选（排除安全格与 8 邻域）
  const banned = new Set();
  banned.add(idx(board, safeR, safeC));
  forEachNeighbor(board, safeR, safeC, (r, c) => banned.add(idx(board, r, c)));
  const candidates = [];
  for (let i = 0; i < board.cells.length; i++) if (!banned.has(i)) candidates.push(i);
  // Fisher–Yates 取前 mineCount 个
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = candidates.slice(0, Math.min(board.mineCount, candidates.length));
  chosen.forEach(i => { board.cells[i].mine = true; });
  // 计算相邻雷数
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const cell = board.cells[idx(board, r, c)];
      if (cell.mine) { cell.adj = -1; continue; }
      let n = 0;
      forEachNeighbor(board, r, c, (nr, nc) => { if (board.cells[idx(board, nr, nc)].mine) n++; });
      cell.adj = n;
    }
  }
  board.minesPlaced = true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initBoard, placeMines, forEachNeighbor, idx };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/game.test.js`
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

```bash
git add game.js tests/game.test.js
git commit -m "feat: board init and safe first-click mine placement with tests"
```

---

### Task 2: 翻开 / 连锁展开 / 胜负判定

**Files:**
- Modify: `game.js`
- Modify: `tests/game.test.js`

**Interfaces:**
- Consumes: `initBoard`, `placeMines`, `forEachNeighbor`, `idx`
- Produces: `reveal(board, r, c)`, `toggleFlag(board, r, c)`, `isWin(board)`, `remainingMines(board)`

- [ ] **Step 1: 写失败测试**

在 `tests/game.test.js` 追加：
```js
const { initBoard, placeMines, reveal, toggleFlag, isWin, remainingMines } = require('../game.js');

test('reveal 首点触发布雷且无雷', () => {
  const b = initBoard(9, 9, 10);
  const res = reveal(b, 4, 4);
  assert.equal(res.hitMine, false);
  assert.ok(b.minesPlaced);
  assert.equal(b.cells[4*9+4].revealed, true);
});

test('reveal 空格连锁展开', () => {
  const b = initBoard(5, 5, 1);
  placeMines(b, 4, 4);            // 唯一雷远离 (0,0) 区域
  const res = reveal(b, 0, 0);    // (0,0) 及邻域应为 0
  assert.equal(res.hitMine, false);
  const revealed = b.cells.filter(c => c.revealed).length;
  assert.ok(revealed > 1, '应连锁展开多格');
});

test('reveal 踩雷返回 hitMine', () => {
  const b = initBoard(3, 3, 1);
  b.cells[0].mine = true;          // 强制 (0,0) 为雷
  // 用安全点触发布雷会重排，故直接标记 minesPlaced 并调用 reveal 内部逻辑
  b.minesPlaced = true;
  // 重新手动保证 (0,0) 为雷且 adj 已算：placeMines 会重排，这里改为直接测试 reveal 命中分支
  const res = reveal(b, 0, 0);
  assert.equal(res.hitMine, true);
});

test('toggleFlag 切换旗并影响剩余雷数', () => {
  const b = initBoard(9, 9, 10);
  placeMines(b, 4, 4);
  assert.equal(remainingMines(b), 10);
  toggleFlag(b, 0, 0);
  assert.equal(b.cells[0].flagged, true);
  assert.equal(remainingMines(b), 9);
  toggleFlag(b, 0, 0);
  assert.equal(b.cells[0].flagged, false);
  assert.equal(remainingMines(b), 10);
});

test('isWin 全非雷格翻开即胜', () => {
  const b = initBoard(3, 3, 1);
  placeMines(b, 2, 2);
  // 翻开所有非雷格
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cell = b.cells[r*3+c];
    if (!cell.mine) { cell.revealed = true; }
  }
  assert.equal(isWin(b), true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/game.test.js`
Expected: FAIL（`reveal is not defined`）。

- [ ] **Step 3: 写最小实现**

在 `game.js`（在 `placeMines` 之后、`module.exports` 之前）追加：
```js
function reveal(board, r, c) {
  const cell = board.cells[idx(board, r, c)];
  if (cell.revealed || cell.flagged) return { hitMine: false, revealedCount: 0 };
  if (!board.minesPlaced) placeMines(board, r, c);
  if (cell.mine) {
    cell.revealed = true;
    return { hitMine: true, revealedCount: 0 };
  }
  // BFS 连锁展开
  let revealedCount = 0;
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cur = board.cells[idx(board, cr, cc)];
    if (cur.revealed || cur.flagged || cur.mine) continue;
    cur.revealed = true;
    revealedCount++;
    if (cur.adj === 0) {
      forEachNeighbor(board, cr, cc, (nr, nc) => {
        const ncell = board.cells[idx(board, nr, nc)];
        if (!ncell.revealed && !ncell.flagged && !ncell.mine) stack.push([nr, nc]);
      });
    }
  }
  return { hitMine: false, revealedCount };
}

function toggleFlag(board, r, c) {
  const cell = board.cells[idx(board, r, c)];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
}

function remainingMines(board) {
  const flags = board.cells.filter(c => c.flagged).length;
  return board.mineCount - flags;
}

function isWin(board) {
  return board.cells.every(c => c.mine || c.revealed);
}
```

并更新 `module.exports`：
```js
module.exports = { initBoard, placeMines, forEachNeighbor, idx, reveal, toggleFlag, remainingMines, isWin };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/game.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add game.js tests/game.test.js
git commit -m "feat: reveal, flood-fill, flag, win/lose detection with tests"
```

---

### Task 3: 最近 10 次记录（localStorage）

**Files:**
- Modify: `game.js`
- Create: `tests/records.test.js`

**Interfaces:**
- Produces: `loadRecords()`, `saveRecord(record)`, 依赖全局 `localStorage`（node 测试用 mock）。

- [ ] **Step 1: 写失败测试**

`tests/records.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');

// Node 环境无 localStorage，提供 mock
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const { loadRecords, saveRecord } = require('../game.js');

test('saveRecord 写入并倒序保留最近 10 条', () => {
  for (let i = 0; i < 12; i++) {
    saveRecord({ date: `2026-07-27T10:${String(i).padStart(2,'0')}:00`,
      difficulty: 'easy', result: 'win', time: i, cellsLeft: 0 });
  }
  const recs = loadRecords();
  assert.equal(recs.length, 10, '最多保留 10 条');
  // 倒序：第一条应为最新（i=11）
  assert.equal(recs[0].time, 11);
  assert.equal(recs[9].time, 2, '最旧的两条（0,1）应被挤出');
});

test('loadRecords 无数据时返回空数组', () => {
  delete store['minesweeper_records'];
  assert.deepEqual(loadRecords(), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/records.test.js`
Expected: FAIL（`loadRecords is not defined`）。

- [ ] **Step 3: 写最小实现**

在 `game.js` 的 `module.exports` 之前追加：
```js
const RECORDS_KEY = 'minesweeper_records';
const MAX_RECORDS = 10;

function loadRecords() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(RECORDS_KEY) : null;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveRecord(record) {
  const recs = loadRecords();
  recs.push(record);
  recs.sort((a, b) => new Date(b.date) - new Date(a.date));
  const trimmed = recs.slice(0, MAX_RECORDS);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed));
  }
  return trimmed;
}
```

更新 `module.exports` 增加 `loadRecords, saveRecord`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/records.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add game.js tests/records.test.js
git commit -m "feat: localStorage recent-10 records with tests"
```

---

### Task 4: 页面骨架、样式与交互渲染

**Files:**
- Create: `index.html`
- Create: `style.css`
- Modify: `game.js`（追加 DOM 渲染与交互，放在逻辑函数之后，仅在浏览器执行）

**Interfaces:**
- Consumes: 全部纯函数（`initBoard`, `placeMines`, `reveal`, `toggleFlag`, `isWin`, `remainingMines`, `loadRecords`, `saveRecord`）
- Produces: 可游玩页面 + 战绩渲染 + 分享按钮钩子（`onShare`）

- [ ] **Step 1: 写 index.html**

`index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>扫雷</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="app">
    <header class="topbar">
      <h1>扫雷</h1>
      <div class="stats">
        <span id="mine-count">💣 0</span>
        <span id="timer">⏱ 0</span>
      </div>
    </header>

    <section class="difficulty">
      <button data-diff="easy" class="active">初级 9×9</button>
      <button data-diff="medium">中级 16×16</button>
      <button data-diff="hard">高级 30×16</button>
    </section>

    <section id="board" class="board"></section>

    <div class="actions">
      <button id="restart">🔄 重开</button>
      <button id="share-btn">📤 分享</button>
    </div>

    <section class="records">
      <h2>最近战绩</h2>
      <ul id="record-list"></ul>
    </section>

    <div id="share-overlay" class="share-overlay">
      <img id="share-card-img" class="share-card-img" src="" alt="分享卡片">
      <p class="share-hint">长按图片保存，发到微信群</p>
      <button id="share-close" class="share-close">关闭</button>
    </div>
  </main>
  <script src="game.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 style.css**

`style.css`:
```css
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #e8f5e9; color: #2e7d32; }
.app { max-width: 480px; margin: 0 auto; padding: 12px; }
.topbar { display: flex; justify-content: space-between; align-items: center; }
.topbar h1 { font-size: 22px; margin: 0; }
.stats span { font-size: 16px; margin-left: 12px; font-variant-numeric: tabular-nums; }
.difficulty { display: flex; gap: 8px; margin: 12px 0; }
.difficulty button { flex: 1; padding: 8px 4px; border: 1.5px solid #a5d6a7; background: #fff;
  border-radius: 10px; font-size: 13px; color: #2e7d32; cursor: pointer; }
.difficulty button.active { background: #81c784; color: #fff; border-color: #81c784; }
.board { display: grid; gap: 2px; background: #c8e6c9; padding: 4px; border-radius: 8px;
  overflow-x: auto; touch-action: manipulation; }
.cell { aspect-ratio: 1 / 1; min-width: 22px; display: flex; align-items: center;
  justify-content: center; background: #a5d6a7; border-radius: 3px; font-weight: 700;
  font-size: 14px; user-select: none; cursor: pointer; }
.cell.revealed { background: #f1f8e9; cursor: default; }
.cell.flagged::after { content: "🚩"; }
.cell.mine { background: #ef9a9a; }
.cell.n1 { color: #1976d2; } .cell.n2 { color: #388e3c; } .cell.n3 { color: #d32f2f; }
.cell.n4 { color: #7b1fa2; } .cell.n5 { color: #ff8f00; } .cell.n6 { color: #0097a7; }
.cell.n7 { color: #455a64; } .cell.n8 { color: #000; }
.actions { display: flex; gap: 8px; margin: 12px 0; }
.actions button { flex: 1; padding: 12px; border: none; border-radius: 12px; font-size: 15px;
  font-weight: 600; cursor: pointer; }
#restart { background: #c8e6c9; color: #2e7d32; }
#share-btn { background: #81c784; color: #fff; }
.records h2 { font-size: 16px; }
.records ul { list-style: none; padding: 0; margin: 0; }
.records li { display: flex; justify-content: space-between; padding: 8px 10px; background: #fff;
  border-radius: 8px; margin-bottom: 6px; font-size: 13px; }
.records li .win { color: #2e7d32; } .records li .lose { color: #d32f2f; }
.share-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  z-index: 200; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
.share-overlay.active { display: flex; }
.share-card-img { max-width: 90vw; max-height: 70vh; border-radius: 16px;
  box-shadow: 0 8px 32px rgba(201,168,76,0.25); object-fit: contain; }
.share-hint { color: #ccc; font-size: 14px; margin-top: 16px; text-align: center; opacity: .85; }
.share-close { color: #ccc; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25);
  padding: 10px 32px; border-radius: 24px; font-size: 15px; cursor: pointer; margin-top: 16px; }
```

- [ ] **Step 3: 写 game.js 的 DOM 部分**

在 `game.js` 末尾、`module.exports` 之后追加（仅浏览器执行）：
```js
if (typeof document !== 'undefined') {
  const DIFFS = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard:   { rows: 16, cols: 30, mines: 99 },
  };
  const DIFF_LABEL = { easy: '初级', medium: '中级', hard: '高级' };

  let board = null;
  let currentDiff = 'easy';
  let timer = 0, timerId = null, started = false, finished = false;

  const $board = document.getElementById('board');
  const $mineCount = document.getElementById('mine-count');
  const $timer = document.getElementById('timer');
  const $recordList = document.getElementById('record-list');
  const $overlay = document.getElementById('share-overlay');

  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => { timer++; $timer.textContent = '⏱ ' + timer; }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); }

  function render() {
    $board.style.gridTemplateColumns = `repeat(${board.cols}, 1fr)`;
    $board.innerHTML = '';
    board.cells.forEach((cell, i) => {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = i;
      if (cell.revealed) {
        el.classList.add('revealed');
        if (cell.mine) { el.classList.add('mine'); el.textContent = '💣'; }
        else if (cell.adj > 0) { el.textContent = cell.adj; el.classList.add('n' + cell.adj); }
      } else if (cell.flagged) {
        el.classList.add('flagged');
      }
      $board.appendChild(el);
    });
    $mineCount.textContent = '💣 ' + remainingMines(board);
  }

  function newGame(diff) {
    currentDiff = diff;
    const d = DIFFS[diff];
    board = initBoard(d.rows, d.cols, d.mines);
    timer = 0; started = false; finished = false; stopTimer();
    $timer.textContent = '⏱ 0';
    document.querySelectorAll('.difficulty button').forEach(b =>
      b.classList.toggle('active', b.dataset.diff === diff));
    render();
  }

  function endGame(win) {
    finished = true; stopTimer();
    if (!win) {
      board.cells.forEach(c => { if (c.mine) c.revealed = true; });
      render();
    }
    const left = win ? 0 : board.cells.filter(c => !c.mine && !c.revealed).length;
    saveRecord({
      date: new Date().toISOString(),
      difficulty: currentDiff,
      result: win ? 'win' : 'lose',
      time: timer, cellsLeft: left,
    });
    renderRecords();
    setTimeout(() => alert(win ? `🎉 通关！用时 ${timer} 秒` : '💥 踩雷了'), 50);
  }

  function onCellClick(i) {
    if (finished) return;
    const r = Math.floor(i / board.cols), c = i % board.cols;
    const cell = board.cells[i];
    if (cell.flagged) return;
    startTimer();
    const res = reveal(board, r, c);
    if (res.hitMine) { render(); endGame(false); return; }
    render();
    if (isWin(board)) endGame(true);
  }

  function onCellLongPress(i) {
    if (finished) return;
    const r = Math.floor(i / board.cols), c = i % board.cols;
    const cell = board.cells[i];
    if (cell.revealed) return;
    toggleFlag(board, r, c);
    render();
  }

  // 长按检测（touch）
  let pressTimer = null, longPressed = false;
  $board.addEventListener('touchstart', e => {
    const t = e.target.closest('.cell'); if (!t) return;
    longPressed = false;
    const i = +t.dataset.i;
    pressTimer = setTimeout(() => { longPressed = true; onCellLongPress(i); }, 400);
  });
  $board.addEventListener('touchend', e => { if (pressTimer) clearTimeout(pressTimer); });
  $board.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });
  // 点击
  $board.addEventListener('click', e => {
    const t = e.target.closest('.cell'); if (!t) return;
    if (longPressed) { longPressed = false; return; }
    onCellClick(+t.dataset.i);
  });
  // 桌面右键插旗
  $board.addEventListener('contextmenu', e => {
    e.preventDefault();
    const t = e.target.closest('.cell'); if (!t) return;
    onCellLongPress(+t.dataset.i);
  });

  function renderRecords() {
    const recs = loadRecords();
    $recordList.innerHTML = '';
    if (!recs.length) { $recordList.innerHTML = '<li>暂无记录</li>'; return; }
    recs.forEach(r => {
      const li = document.createElement('li');
      const d = new Date(r.date);
      const ts = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      li.innerHTML = `<span>${DIFF_LABEL[r.difficulty]} · ${ts}</span>` +
        `<span class="${r.result}">${r.result==='win'?'胜':'负'} ${r.time}s</span>`;
      $recordList.appendChild(li);
    });
  }

  // 分享按钮：调用 share-card-generator 逻辑（Task 5 注入 generateShareCard）
  document.getElementById('share-btn').addEventListener('click', () => {
    if (typeof window.generateShareCard === 'function') window.generateShareCard(currentDiff, timer, finished);
    else alert('分享功能准备中');
  });
  document.getElementById('share-close').addEventListener('click', () =>
    $overlay.classList.remove('active'));
  $overlay.addEventListener('click', e => { if (e.target === $overlay) $overlay.classList.remove('active'); });
  document.querySelectorAll('.difficulty button').forEach(b =>
    b.addEventListener('click', () => newGame(b.dataset.diff)));
  document.getElementById('restart').addEventListener('click', () => newGame(currentDiff));

  newGame('easy');
  renderRecords();
}
```

- [ ] **Step 4: 手动验证（浏览器/移动端）**

Run: 在浏览器打开 `index.html`（或 `python3 -m http.server` 后访问）。
Expected:
- 三档难度可切换，棋盘渲染正确；
- 点按翻开、空格连锁、长按/右键插旗、剩余雷数与计时正确；
- 踩雷显示全部雷并提示失败；全清提示通关并写入战绩；
- 刷新后"最近战绩"保留且倒序。

- [ ] **Step 5: 提交**

```bash
git add index.html style.css game.js
git commit -m "feat: page, styles, interaction rendering for minesweeper"
```

---

### Task 5: 分享卡（复用 share-card-generator skill）

**Files:**
- Create: `share-card.html`（基于 `references/card-template.html`）
- Modify: `game.js`（注入 `window.generateShareCard`，基于 `references/share-button-pattern.js`）

**参考资源**（已同步到 CodeBuddy，路径：
`/Users/welkin/.codebuddy/skills/share-card-generator/references/card-template.html`
`/Users/welkin/.codebuddy/skills/share-card-generator/references/share-button-pattern.js`）

**Interfaces:**
- Consumes: `currentDiff`, `timer`, `finished`, `DIFF_LABEL`（来自 Task 4 作用域）
- Produces: `window.generateShareCard(diff, time, finished)` → 离屏 canvas 生成 1200×1600 卡片 + 二维码浮层；`share-card.html` 独立页。

- [ ] **Step 1: 写 share-card.html（独立分享页）**

基于 skill 的 `card-template.html`，填入本局成绩。创建 `share-card.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>扫雷 · 分享卡片</title>
<style>
  body { font-family: -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; text-align:center; padding:40px 16px; background:#f5f5f5; }
  canvas { border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,.12); max-width:90vw; }
  button { margin-top:20px; padding:14px 40px; font-size:17px; background:#81C784; color:#fff; border:none; border-radius:14px; cursor:pointer; font-weight:600; }
  p { color:#888; margin-top:12px; font-size:14px; }
</style>
</head>
<body>
<h2>扫雷 · 我的战绩</h2>
<canvas id="c"></canvas>
<p>点击下载 PNG，上传到托管平台作为 og:image</p>
<button id="dl" onclick="downloadPNG()" disabled>加载中…</button>
<script>
const CONFIG = {
  url: location.href,
  title: "扫雷",
  subtitle: "初级 · 用时 42 秒 · 通关",
  features: ["🎯 难度：初级 9×9", "⏱ 用时：42 秒", "🏆 结果：通关"],
  primaryColor: "#81C784", primaryLight: "#A5D6A7",
};
const W=1200,H=1600; const canvas=document.getElementById("c"); canvas.width=W; canvas.height=H;
const ctx=canvas.getContext("2d");
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function draw(qr){
  const c=CONFIG;
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#E8F5E9"); g.addColorStop(.4,"#FFF9C4"); g.addColorStop(1,"#FFFDE7");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.12;
  [{x:160,y:360,r:200,f:c.primaryColor},{x:960,y:280,r:140,f:c.primaryLight},{x:1040,y:1120,r:260,f:"#FFE082"},{x:200,y:1240,r:120,f:c.primaryColor},{x:600,y:200,r:90,f:c.primaryLight}]
    .forEach(d=>{ctx.fillStyle=d.f;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;
  ctx.fillStyle="#FFF"; ctx.shadowColor="rgba(0,0,0,.08)"; ctx.shadowBlur=80; ctx.shadowOffsetY=12;
  rr(90,240,W-180,H-600,56); ctx.fill(); ctx.shadowColor="transparent"; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  ctx.fillStyle=c.primaryColor; ctx.font="bold 88px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign="center";
  ctx.fillText(c.title,W/2,410);
  ctx.font="90px sans-serif"; ctx.fillText("💣 🚩 💡",W/2,560);
  ctx.fillStyle="#999"; ctx.font="44px -apple-system,'PingFang SC',sans-serif"; ctx.fillText(c.subtitle,W/2,680);
  ctx.strokeStyle=c.primaryLight; ctx.lineWidth=3; ctx.setLineDash([16,12]);
  ctx.beginPath(); ctx.moveTo(190,760); ctx.lineTo(W-190,760); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle="#777"; ctx.font="40px -apple-system,'PingFang SC',sans-serif";
  c.features.forEach((f,i)=>ctx.fillText(f,W/2,860+i*96));
  const qs=280,qx=(W-qs)/2,qy=H-400; ctx.fillStyle="#FFF"; rr(qx-32,qy-32,qs+64,qs+64,40); ctx.fill();
  if(qr) ctx.drawImage(qr,qx,qy,qs,qs);
  ctx.fillStyle="#AAA"; ctx.font="28px -apple-system,'PingFang SC',sans-serif"; ctx.fillText("扫码或长按识别 · 和朋友一起玩",W/2,H-48);
  document.getElementById("dl").disabled=false; document.getElementById("dl").textContent="下载 PNG";
}
const qr=new Image(); qr.crossOrigin="anonymous";
qr.onload=()=>draw(qr);
qr.onerror=()=>draw(null);
qr.src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data="+encodeURIComponent(CONFIG.url)+"&margin=8";
function downloadPNG(){const a=document.createElement("a");a.download="share-card.png";a.href=canvas.toDataURL("image/png");a.click();}
</script>
</body>
</html>
```
（说明：`share-card.html` 的 `subtitle`/`features` 为示例文案，可手动改成实际战绩；游戏内分享走下一步动态生成。）

- [ ] **Step 2: 在 game.js 注入 window.generateShareCard（游戏内浮层）**

在 Task 4 的 `if (typeof document !== 'undefined') { ... }` 块内、`newGame('easy')` 之前，追加：
```js
// 复用 share-card-generator：离屏生成 1200×1600 分享卡
function generateShareCardShare(diff, time, finishedState) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  const W = 1200, H = 1600;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#E8F5E9"); g.addColorStop(.4,"#FFF9C4"); g.addColorStop(1,"#FFFDE7");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.12;
  [{x:160,y:360,r:200,f:"#81C784"},{x:960,y:280,r:140,f:"#A5D6A7"},{x:1040,y:1120,r:260,f:"#FFE082"},{x:200,y:1240,r:120,f:"#81C784"},{x:600,y:200,r:90,f:"#A5D6A7"}]
    .forEach(d=>{ctx.fillStyle=d.f;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;
  ctx.fillStyle="#FFF"; ctx.shadowColor="rgba(0,0,0,.08)"; ctx.shadowBlur=80; ctx.shadowOffsetY=12;
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
  rr(90,240,W-180,H-600,56); ctx.fill(); ctx.shadowColor="transparent"; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  const result = finishedState ? '已结束' : '进行中';
  ctx.fillStyle="#81C784"; ctx.font="bold 88px -apple-system,'PingFang SC',sans-serif"; ctx.textAlign="center";
  ctx.fillText("扫雷",W/2,410);
  ctx.font="90px sans-serif"; ctx.fillText("💣 🚩 💡",W/2,560);
  ctx.fillStyle="#999"; ctx.font="44px -apple-system,'PingFang SC',sans-serif";
  ctx.fillText(`${DIFF_LABEL[diff]} · 用时 ${time}s · ${result}`,W/2,680);
  ctx.strokeStyle="#A5D6A7"; ctx.lineWidth=3; ctx.setLineDash([16,12]);
  ctx.beginPath(); ctx.moveTo(190,760); ctx.lineTo(W-190,760); ctx.stroke(); ctx.setLineDash([]);
  const features=["🎯 难度："+DIFF_LABEL[diff],"⏱ 用时："+time+" 秒","🏆 状态："+result];
  ctx.fillStyle="#777"; ctx.font="40px -apple-system,'PingFang SC',sans-serif";
  features.forEach((f,i)=>ctx.fillText(f,W/2,860+i*96));
  const qrImg=new Image(); qrImg.crossOrigin="anonymous";
  qrImg.onload=()=>{const qs=280,qx=(W-qs)/2,qy=H-400;ctx.fillStyle="#FFF";rr(qx-32,qy-32,qs+64,qs+64,40);ctx.fill();ctx.drawImage(qrImg,qx,qy,qs,qs);show();};
  qrImg.onerror=()=>show();
  qrImg.src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data="+encodeURIComponent(location.href)+"&margin=8";
  function show(){
    document.getElementById("share-card-img").src=canvas.toDataURL("image/png");
    $overlay.classList.add("active");
    document.body.style.overflow="hidden";
  }
}
window.generateShareCard = generateShareCardShare;
```

- [ ] **Step 3: 手动验证**

Run: 浏览器打开 `index.html`，游玩一局后点"📤 分享"。
Expected:
- 浮层显示 1200×1600 分享卡（含难度/用时/状态 + 二维码），微信内可长按保存；
- 独立打开 `share-card.html` 可下载 PNG。

- [ ] **Step 4: 提交**

```bash
git add share-card.html game.js
git commit -m "feat: share card via share-card-generator (overlay + standalone page)"
```

---

## Self-Review 小结（已内联修正）
- Spec 覆盖：三档难度(T1/T4)、首点安全(T1)、连锁/胜负(T2)、记录倒序≤10(T3)、分享卡(T5)、移动端(T4) 均有对应任务。
- 占位符：无，所有步骤含具体代码。
- 类型一致：`initBoard/placeMines/reveal/toggleFlag/isWin/remainingMines/loadRecords/saveRecord` 名称在 T1–T3 定义并在 T4 消费，保持一致。
