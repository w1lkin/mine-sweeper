# 扫雷 5 项优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为扫雷网页游戏新增「自动标雷（默认开）/ 暂停 / 滚动条常驻 / 浅色 Excel 风 / 沉浸式」五项摸鱼向优化，保持架构与可测试性不变。

**Architecture:** 纯逻辑层 `game.js` 前半段（`typeof module` 守卫导出部分）继续零 DOM、可在 Node 测试；仅 `autoFlag` 在此层实现并补单测。所有交互/视觉改动加在浏览器层（`game.js` 后半段 `typeof document !== 'undefined'` 守卫内）、`index.html` 结构与 `style.css`。新功能均为可关/可逆开关，不改计分与分享卡。

**Tech Stack:** 原生 HTML/CSS/JS，零依赖、零构建。`node --test` 跑逻辑单测。

## Global Constraints

- 零依赖、零构建框架；所有 CSS 内联在 `style.css`，JS 在 `game.js`。
- 纯逻辑层（首段）保持可在 Node 导入测试；DOM 层用 `typeof document !== 'undefined'` 守卫。
- 所有新功能默认可关 / 可逆，不影响现有计分、记录与分享卡。
- 自动标雷：`autoFlag` 仅做「`flagged + hidden === 数字`」的确定性推导，**绝不猜测**。
- 自动标雷默认 **开**（`localStorage` 记忆，存 `'false'` 才关）。
- 暂停：点棋盘「外」空白区自动暂停；点控件按钮（难度/重开/分享/各开关）**不**触发暂停；点击棋盘（含暂停遮罩）取消暂停；游戏结束不响应。
- 沉浸态：隐藏难度/分享/重开/历史/标题，**保留状态栏(💣⏱)与退出按钮**。
- 滚动条：移动端也常驻可见（Webkit + Firefox 双写法），仅在棋盘溢出时显示。

---

### Task 1: 纯逻辑 `autoFlag` + 单测（TDD）

**Files:**
- Modify: `tests/game.test.js`（`require` 增加 `autoFlag`，追加 2 个测试）
- Modify: `game.js`（纯逻辑段新增 `autoFlag`，并在 `module.exports` 导出）

**Interfaces:**
- 新增导出：`autoFlag(board)` —— 原地修改 `board.cells[*].flagged`，无返回值。
- 消费：`initBoard` / `idx` / `forEachNeighbor`（已有）。
- 产出：浏览器层 Task 2 调用 `autoFlag(board)`。

- [ ] **Step 1: 写失败测试**

在 `tests/game.test.js` 顶部 `require` 加入 `autoFlag`：

```js
const {
  initBoard, placeMines, forEachNeighbor, idx,
  reveal, toggleFlag, isWin, remainingMines, autoFlag,
} = require('../game.js');
```

在文件末尾追加：

```js
// ===== autoFlag =====
function recomputeAdj(b) {
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    const cell = b.cells[idx(b, r, c)];
    if (cell.mine) { cell.adj = -1; continue; }
    let n = 0;
    forEachNeighbor(b, r, c, (nr, nc) => { if (b.cells[idx(b, nr, nc)].mine) n++; });
    cell.adj = n;
  }
}

test('autoFlag 为必雷的 hidden 邻格加旗', () => {
  const b = initBoard(2, 2, 0);
  b.cells[idx(b, 0, 0)].mine = true;
  b.cells[idx(b, 0, 1)].mine = true;
  b.minesPlaced = true;
  recomputeAdj(b);
  b.cells[idx(b, 1, 0)].revealed = true;
  b.cells[idx(b, 1, 1)].revealed = true;
  toggleFlag(b, 0, 0); // 已确认 (0,0) 是雷
  autoFlag(b);
  assert.equal(b.cells[idx(b, 0, 1)].flagged, true, '(0,1) 必为雷应被加旗');
  assert.equal(b.cells[idx(b, 1, 0)].flagged, false, '已翻开格不应被加旗');
  assert.equal(b.cells[idx(b, 1, 1)].flagged, false, '已翻开格不应被加旗');
});

test('autoFlag 在不确定时不会误标', () => {
  const b = initBoard(2, 2, 0);
  b.cells[idx(b, 0, 0)].mine = true; // 仅一个雷
  b.minesPlaced = true;
  recomputeAdj(b);
  b.cells[idx(b, 1, 0)].revealed = true; // adj = 1
  autoFlag(b);
  // (1,0) adj=1, flagged=0, hidden 邻格=(0,1)安全,(1,1)安全 => 2 != 1 => 不加旗
  assert.equal(b.cells[idx(b, 0, 1)].flagged, false);
  assert.equal(b.cells[idx(b, 1, 1)].flagged, false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/game.test.js`
Expected: 失败，报 `autoFlag is not a function` / `TypeError`。

- [ ] **Step 3: 实现 `autoFlag`**

在 `game.js` 纯逻辑段（`toggleFlag` 与 `remainingMines` 之间）新增：

```js
function autoFlag(board) {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const cell = board.cells[idx(board, r, c)];
      if (!cell.revealed || cell.mine || cell.adj <= 0) continue;
      let flagged = 0;
      const hidden = [];
      forEachNeighbor(board, r, c, (nr, nc) => {
        const n = board.cells[idx(board, nr, nc)];
        if (n.flagged) flagged++;
        else if (!n.revealed) hidden.push(n);
      });
      // 确定性推导：已标 + 未翻 数恰等于该格数字 => 所有未翻邻格必为雷
      if (hidden.length > 0 && flagged + hidden.length === cell.adj) {
        hidden.forEach(n => { if (!n.flagged) n.flagged = true; });
      }
    }
  }
}
```

并在文件末尾 `module.exports = { ... }` 中加入 `autoFlag`：

```js
module.exports = {
  initBoard, placeMines, forEachNeighbor, idx,
  reveal, toggleFlag, remainingMines, isWin, autoFlag,
  loadRecords, saveRecord, MAX_RECORDS, RECORDS_KEY,
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/game.test.js`
Expected: 全部 PASS（含原有用例）。

- [ ] **Step 5: 提交**

```bash
git add game.js tests/game.test.js
git commit -m "feat(logic): 新增确定性 autoFlag 推导并补单测"
```

---

### Task 2: 工具栏 + 自动标雷浏览器层接入

**Files:**
- Modify: `index.html`（难度与棋盘之间插入 `.controls`；用 `.board-wrap` 包裹 `#board`）
- Modify: `game.js`（浏览器层：新增 `autoFlagOn` 状态、DOM 引用、toggle 绑定、在 `onCellClick`/`onCellLongPress` 后调用 `autoFlag`）
- Modify: `style.css`（追加 `.controls` / `.toggle` 样式）

**Interfaces:**
- 消费：Task 1 的 `autoFlag(board)`；新增 DOM `#autoflag-toggle`。
- 产出：开关状态 `autoFlagOn`，供后续任务复用（暂停/沉浸不影响它）。

- [ ] **Step 1: 改 `index.html` 结构**

将 `index.html` 中：

```html
    <section class="difficulty">
      <button data-diff="easy" class="active">初级 9×9</button>
      <button data-diff="medium">中级 16×16</button>
      <button data-diff="hard">高级 30×16</button>
    </section>

    <section id="board" class="board"></section>
```

替换为：

```html
    <section class="difficulty">
      <button data-diff="easy" class="active">初级 9×9</button>
      <button data-diff="medium">中级 16×16</button>
      <button data-diff="hard">高级 30×16</button>
    </section>

    <div class="controls">
      <label class="toggle"><input type="checkbox" id="autoflag-toggle"> <span>自动标雷</span></label>
      <button id="pause-btn" type="button">⏸ 暂停</button>
      <button id="immerse-btn" type="button">🙈 沉浸</button>
    </div>

    <div class="board-wrap">
      <section id="board" class="board"></section>
      <div id="pause-overlay" class="pause-overlay"><span>已暂停</span><small>点击棋盘继续</small></div>
    </div>
```

- [ ] **Step 2: 浏览器层状态与 DOM 引用**

在 `game.js` 浏览器层，于 `let timer = 0, timerId = null, started = false, finished = false, lastWin = null;` 之后追加：

```js
  let autoFlagOn = (localStorage.getItem('minesweeper_autoflag') !== 'false'); // 默认开
  let paused = false;
```

在 `$overlay` 引用之后追加：

```js
  const $boardWrap = document.querySelector('.board-wrap');
  const $autoFlagToggle = document.getElementById('autoflag-toggle');
  const $pauseBtn = document.getElementById('pause-btn');
  const $immerseBtn = document.getElementById('immerse-btn');
```

- [ ] **Step 3: 接入 `autoFlag` 调用**

在 `onCellClick` 中，`render();` 之前插入：

```js
    if (autoFlagOn) autoFlag(board);
    render();
```

在 `onCellLongPress` 中，`render();` 之前插入：

```js
    if (autoFlagOn) autoFlag(board);
    render();
```

（即在两处 `render();` 前各加一行守卫调用。）

- [ ] **Step 4: 绑定自动标雷开关**

在浏览器层初始化区（`newGame('easy'); renderRecords();` 之前或之后）追加：

```js
  $autoFlagToggle.checked = autoFlagOn;
  $autoFlagToggle.addEventListener('change', () => {
    autoFlagOn = $autoFlagToggle.checked;
    try { localStorage.setItem('minesweeper_autoflag', autoFlagOn ? '1' : '0'); } catch (e) {}
    if (autoFlagOn && board) { autoFlag(board); render(); }
  });
```

- [ ] **Step 5: 追加 `.controls` 样式（Task 3/5 还会追加其它 CSS）**

在 `style.css` 末尾追加：

```css
.controls { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
.controls button { flex: 1; padding: 10px 4px; border: 1.5px solid #c0c0c0; background: #fff;
  border-radius: 10px; font-size: 14px; color: #333; cursor: pointer; }
.controls .toggle { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 14px; color: #333; border: 1.5px solid #c0c0c0; background: #fff;
  border-radius: 10px; padding: 10px 4px; cursor: pointer; }
.controls .toggle input { width: 16px; height: 16px; }
```

- [ ] **Step 6: 运行校验**

浏览器手测：打开 `index.html`，勾选「自动标雷」（默认勾选），玩一局，当某数字格的 `已标+未翻 === 数字` 时，剩余未翻邻格应自动加旗。取消勾选则不再自动标。

- [ ] **Step 7: 提交**

```bash
git add index.html game.js style.css
git commit -m "feat(ui): 新增工具栏并将 autoFlag 接入交互"
```

---

### Task 3: 暂停（点外暂停 / 点牌面恢复）

**Files:**
- Modify: `game.js`（浏览器层：`startTimer`/`stopTimer` 改造、`pauseGame`/`resumeGame`、document 点击监听、暂停按钮绑定）
- Modify: `style.css`（追加 `.board-wrap` 与 `.pause-overlay` 样式；HTML 已在 Task 2 加入 `#pause-overlay`）

**Interfaces:**
- 消费：DOM `#pause-overlay`（Task 2 已加）、`#pause-btn`、`finished`/`started` 状态。
- 产出：`paused` 状态，供沉浸态复用（沉浸态仍可暂停）。

- [ ] **Step 1: 改造计时器以支持暂停/恢复**

将 `game.js` 中：

```js
  function startTimer() {
    if (started) return;
    started = true;
    timerId = setInterval(() => { timer++; $timer.textContent = '⏱ ' + timer; }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); }
```

替换为：

```js
  function startTimer() {
    if (timerId) return;
    started = true;
    timerId = setInterval(() => { timer++; $timer.textContent = '⏱ ' + timer; }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
```

- [ ] **Step 2: 新增暂停/恢复函数**

在 `stopTimer` 定义之后追加：

```js
  function pauseGame() {
    if (finished || paused) return;
    paused = true;
    stopTimer();
    if ($boardWrap) $boardWrap.classList.add('paused');
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    if ($boardWrap) $boardWrap.classList.remove('paused');
    if (started && !finished) startTimer(); // 继续计时
  }
```

- [ ] **Step 3: document 点击监听（点外暂停 / 点牌面恢复）**

在浏览器层初始化区追加：

```js
  document.addEventListener('click', (e) => {
    if (finished) return;
    const onBoard = e.target.closest('.board-wrap');
    if (paused) {
      if (onBoard) resumeGame(); // 单击牌面（含遮罩）取消暂停
      return;
    }
    if (onBoard) return;                 // 正常棋盘点击由 board 处理器处理
    if (e.target.closest('button')) return; // 控件按钮放行，不暂停
    pauseGame();                         // 点空白区 => 暂停
  });
```

- [ ] **Step 4: 绑定暂停按钮**

在 `document.getElementById('restart').addEventListener(...)` 附近追加：

```js
  $pauseBtn.addEventListener('click', () => { if (paused) resumeGame(); else pauseGame(); });
```

- [ ] **Step 5: 暂停遮罩样式**

在 `style.css` 末尾追加：

```css
.board-wrap { position: relative; }
.pause-overlay { display: none; position: absolute; inset: 0; z-index: 50;
  flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: rgba(240,240,240,0.96); color: #555; border-radius: 8px;
  cursor: pointer; user-select: none; -webkit-user-select: none; }
.board-wrap.paused .pause-overlay { display: flex; }
.pause-overlay span { font-size: 22px; font-weight: 700; }
.pause-overlay small { font-size: 13px; color: #999; }
```

- [ ] **Step 6: 运行校验**

浏览器手测：游戏中点击页面空白区（标题/记录区/页面边缘）→ 棋盘被遮罩盖住、计时停止；点击棋盘（遮罩）→ 恢复、计时继续；游戏结束后再点空白区不触发暂停。

- [ ] **Step 7: 提交**

```bash
git add game.js style.css
git commit -m "feat(ui): 暂停功能，点外暂停点牌面恢复并冻结计时"
```

---

### Task 4: 浅色 Excel 风 + 滚动条常驻

**Files:**
- Modify: `style.css`（重写配色变量/规则为浅色网格；追加常驻滚动条样式）

**Interfaces:**
- 消费：`.board` / `.cell` / `.difficulty button` / `.actions button` 等现有选择器。
- 产出：浅色主题 + 双向常驻滚动条；不影响逻辑。

- [ ] **Step 1: 改页面/文字底色**

将 `style.css` 中：

```css
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #e8f5e9; color: #2e7d32; }
```

替换为：

```css
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #f3f3f3; color: #222; }
```

- [ ] **Step 2: 改棋盘为细灰网格（Excel 单元格观感）**

将：

```css
.board { display: grid; gap: 2px; background: #c8e6c9; padding: 4px; border-radius: 8px;
  overflow-x: auto; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.cell { aspect-ratio: 1 / 1; min-width: 22px; display: flex; align-items: center;
  justify-content: center; background: #a5d6a7; border-radius: 3px; font-weight: 700;
  font-size: 14px; user-select: none; cursor: pointer; }
.cell.revealed { background: #f1f8e9; cursor: default; }
```

替换为：

```css
.board { display: grid; gap: 1px; background: #d0d0d0; padding: 1px; border: 1px solid #d0d0d0;
  border-radius: 4px; overflow-x: auto; overflow-y: auto; touch-action: manipulation;
  -webkit-user-select: none; user-select: none;
  scrollbar-width: thin; scrollbar-color: #b0b0b0 #ececec; }
.cell { aspect-ratio: 1 / 1; min-width: 22px; display: flex; align-items: center;
  justify-content: center; background: #fff; border-radius: 0; font-weight: 700;
  font-size: 14px; user-select: none; cursor: pointer; }
.cell.revealed { background: #fafafa; cursor: default; }
```

- [ ] **Step 3: 改难度/按钮/记录配色为中性灰 + 蓝强调**

将：

```css
.difficulty button { flex: 1; padding: 8px 4px; border: 1.5px solid #a5d6a7; background: #fff;
  border-radius: 10px; font-size: 13px; color: #2e7d32; cursor: pointer; }
.difficulty button.active { background: #81c784; color: #fff; border-color: #81c784; }
```

替换为：

```css
.difficulty button { flex: 1; padding: 8px 4px; border: 1.5px solid #c0c0c0; background: #fff;
  border-radius: 10px; font-size: 13px; color: #333; cursor: pointer; }
.difficulty button.active { background: #4472c4; color: #fff; border-color: #4472c4; }
```

将：

```css
#restart { background: #c8e6c9; color: #2e7d32; }
#share-btn { background: #81c784; color: #fff; }
```

替换为：

```css
#restart { background: #e0e0e0; color: #333; }
#share-btn { background: #4472c4; color: #fff; }
```

将：

```css
.records li { display: flex; justify-content: space-between; padding: 8px 10px; background: #fff;
  border-radius: 8px; margin-bottom: 6px; font-size: 13px; }
.records li .win { color: #2e7d32; } .records li .lose { color: #d32f2f; }
```

替换为：

```css
.records li { display: flex; justify-content: space-between; padding: 8px 10px; background: #fff;
  border: 1px solid #e3e3e3; border-radius: 8px; margin-bottom: 6px; font-size: 13px; }
.records li .win { color: #2e7d32; } .records li .lose { color: #d32f2f; }
```

- [ ] **Step 4: 追加常驻滚动条（Webkit）**

在 `style.css` 末尾追加：

```css
.board::-webkit-scrollbar { width: 10px; height: 10px; }
.board::-webkit-scrollbar-track { background: #ececec; border-radius: 6px; }
.board::-webkit-scrollbar-thumb { background: #b0b0b0; border-radius: 6px; }
.board::-webkit-scrollbar-thumb:hover { background: #909090; }
```

- [ ] **Step 5: 运行校验**

浏览器手测：整体为白底灰网格、像 Excel。高级(30×16)棋盘在移动端/窄屏下，底部与右侧出现**常驻**灰色滚动条，可直接拖动；棋盘放得下时不显示。

- [ ] **Step 6: 提交**

```bash
git add style.css
git commit -m "style: 浅色 Excel 风配色 + 棋盘双向常驻滚动条"
```

---

### Task 5: 沉浸式扫雷（按钮切换）

**Files:**
- Modify: `game.js`（浏览器层：绑定 `#immerse-btn` 切换 `body.immersive` 并记忆；启动时恢复）
- Modify: `style.css`（追加沉浸态隐藏规则）

**Interfaces:**
- 消费：DOM `#immerse-btn`（Task 2 已加）、`localStorage`。
- 产出：沉浸态隐藏难度/分享/重开/记录/标题，保留状态栏与退出按钮。

- [ ] **Step 1: 绑定沉浸按钮 + 记忆 + 启动恢复**

在浏览器层初始化区（`newGame('easy'); renderRecords();` 附近）追加：

```js
  function setImmerse(on) {
    document.body.classList.toggle('immersive', on);
    $immerseBtn.textContent = on ? '😎 退出' : '🙈 沉浸';
    try { localStorage.setItem('minesweeper_immersive', on ? '1' : '0'); } catch (e) {}
  }
  $immerseBtn.addEventListener('click', () => setImmerse(!document.body.classList.contains('immersive')));
  if (localStorage.getItem('minesweeper_immersive') === '1') setImmerse(true);
```

- [ ] **Step 2: 沉浸态隐藏规则**

在 `style.css` 末尾追加：

```css
.immersive .difficulty,
.immersive .actions,
.immersive .records,
.immersive .topbar h1,
.immersive #autoflag-toggle,
.immersive #pause-btn { display: none; }
/* 保留 .topbar 状态栏 与 .controls 中的退出按钮 */
```

- [ ] **Step 3: 运行校验**

浏览器手测：点「🙈 沉浸」→ 仅剩状态栏(💣⏱)、「😎 退出」按钮与棋盘；难度/分享/重开/历史/标题均隐藏。点「😎 退出」恢复。刷新页面若曾进入沉浸则自动保持（localStorage）。沉浸态下点棋盘外仍可暂停、点牌面恢复。

- [ ] **Step 4: 提交**

```bash
git add game.js style.css
git commit -m "feat(ui): 沉浸式扫雷，按钮切换并隐藏非棋盘元素"
```

---

## 自检摘要（已内联修正）

- **Spec 覆盖**：自动标雷(确定性+默认开)→ Task1/2；暂停(点外/点牌面/排除按钮/冻结计时)→ Task3；滚动条常驻 → Task4；浅色 Excel 风 → Task4；沉浸(保留状态栏+退出)→ Task5。全覆盖。
- **占位符扫描**：无 TBD/TODO；每步均含可直接落地的代码或命令。
- **类型一致性**：`autoFlag(board)` 在 Task1 定义并导出，Task2 以相同签名调用；`paused`、`autoFlagOn` 全程命名一致；`#autoflag-toggle`/`#pause-btn`/`#immerse-btn`/`#pause-overlay` 在 HTML/JS/CSS 三处命名一致。
- **无新增 DOM 测试框架**：暂停/沉浸/滚动条/配色按 spec 约定浏览器手测，未强行加自动化。
