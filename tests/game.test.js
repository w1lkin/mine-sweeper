const test = require('node:test');
const assert = require('node:assert');
const {
  initBoard, placeMines, forEachNeighbor, idx,
  reveal, toggleFlag, isWin, remainingMines, autoFlag, chordReveal,
} = require('../game.js');

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
  assert.equal(b.cells[4 * 9 + 4].mine, false);
  let safe = true;
  forEachNeighbor(b, 4, 4, (r, c) => { if (b.cells[idx(b, r, c)].mine) safe = false; });
  assert.ok(safe, '安全格邻域不应有雷');
});

test('placeMines 计算相邻雷数', () => {
  const b = initBoard(3, 3, 1);
  placeMines(b, 2, 2); // 唯一雷落在远离 (2,2) 处
  const mineIdx = b.cells.findIndex(c => c.mine);
  const mr = Math.floor(mineIdx / 3), mc = mineIdx % 3;
  let adjFound = false;
  forEachNeighbor(b, mr, mc, (nr, nc) => { if (b.cells[idx(b, nr, nc)].adj >= 1) adjFound = true; });
  assert.ok(adjFound, '雷的邻格 adj 应 >= 1');
});

test('reveal 首点触发布雷且无雷', () => {
  const b = initBoard(9, 9, 10);
  const res = reveal(b, 4, 4);
  assert.equal(res.hitMine, false);
  assert.ok(b.minesPlaced);
  assert.equal(b.cells[4 * 9 + 4].revealed, true);
});

test('reveal 空格连锁展开', () => {
  const b = initBoard(5, 5, 1);
  placeMines(b, 4, 4); // 唯一雷远离 (0,0)
  const res = reveal(b, 0, 0);
  assert.equal(res.hitMine, false);
  const revealed = b.cells.filter(c => c.revealed).length;
  assert.ok(revealed > 1, '应连锁展开多格');
});

test('reveal 踩雷返回 hitMine', () => {
  const b = initBoard(3, 3, 1);
  b.cells[0].mine = true;     // 强制 (0,0) 为雷
  b.minesPlaced = true;
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
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cell = b.cells[r * 3 + c];
    if (!cell.mine) cell.revealed = true;
  }
  assert.equal(isWin(b), true);
});

test('repeatable safe-first-click across many seeds', () => {
  for (let t = 0; t < 50; t++) {
    const b = initBoard(9, 9, 10);
    reveal(b, 4, 4);
    assert.equal(b.cells[4 * 9 + 4].mine, false);
  }
});

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
  // (1,0) adj=1, flagged=0, hidden 邻格 3 个 => 3 != 1 => 不加旗
  assert.equal(b.cells[idx(b, 0, 1)].flagged, false);
  assert.equal(b.cells[idx(b, 1, 1)].flagged, false);
});

// ===== chordReveal（双击数字自动散开）=====

test('chordReveal 旗数未匹配 adj 时不展开', () => {
  // 2×2 棋盘：角落 (0,0) 是雷，(1,0) adj=1 已翻。周围 0 面旗、2 个 hidden（(0,1)/(1,1) 非雷）
  // 1 != 1? flag=0, adj=1, hidden=2 → 条件不满足，应拒绝展开
  const b = initBoard(2, 2, 0);
  b.cells[idx(b, 0, 0)].mine = true;
  b.minesPlaced = true;
  recomputeAdj(b);
  b.cells[idx(b, 1, 0)].revealed = true; // adj = 1
  const res = chordReveal(b, 1, 0);
  assert.equal(res.triggered, false, '条件不足应不触发');
  assert.equal(res.hitMine, false);
  assert.equal(b.cells[idx(b, 0, 1)].revealed, false);
  assert.equal(b.cells[idx(b, 1, 1)].revealed, false);
});

test('chordReveal 旗数匹配且有 hidden 时自动展开', () => {
  // 2×2 棋盘：(0,0) 是雷，(0,1) 也铺一个雷，(1,0) adj=2 已翻 (1,0)
  // 玩家对 (0,0)/(0,1) 都已插旗，邻域 hidden 只有 (1,1)，应自动翻 (1,1)
  const b = initBoard(2, 2, 0);
  b.cells[idx(b, 0, 0)].mine = true;
  b.cells[idx(b, 0, 1)].mine = true;
  b.minesPlaced = true;
  recomputeAdj(b);
  b.cells[idx(b, 1, 0)].revealed = true; // adj = 2
  toggleFlag(b, 0, 0);
  toggleFlag(b, 0, 1);
  const res = chordReveal(b, 1, 0);
  assert.equal(res.triggered, true);
  assert.equal(res.hitMine, false);
  assert.equal(b.cells[idx(b, 1, 1)].revealed, true, '(1,1) 应被自动翻开');
  assert.equal(b.cells[idx(b, 0, 0)].flagged, true, '已插旗格不被改动');
  assert.equal(b.cells[idx(b, 0, 1)].flagged, true, '已插旗格不被改动');
});

test('chordReveal 误判时命中雷应返回 hitMine', () => {
  // 玩家对某个数字格乱插了「旗数刚好匹配」但实际不是雷的面旗，
  // 那么隐藏真正雷的那一面hidden 点下去会爆。
  // 这里：3×3，中心 (1,1) adj=2 已翻开，玩家错误地把 (0,0) 和 (2,2) 都插了旗。
  // 真正雷是 (0,0) 和 (2,2)（用户在 (1,1) 处双击 chord 时点开的 hidden 里包含 (0,0)，它是雷）
  const b = initBoard(3, 3, 0);
  b.cells[idx(b, 0, 0)].mine = true; // 真正雷在 (0,0)
  b.cells[idx(b, 1, 0)].mine = true; // 真正雷在 (1,0)
  b.minesPlaced = true;
  recomputeAdj(b);
  // (0,1) adj = 1（邻域有雷 (0,0)，无 (1,0)）=> 玩家在 (0,0) 插旗 -> 双击 (0,1) 触发 chord
  b.cells[idx(b, 0, 1)].revealed = true; // adj = 1（(0,0) 是雷）
  toggleFlag(b, 0, 0); // 正确
  // (1,1) adj = 2（(0,0)、(1,0) 都是雷）=> 玩家双击 (1,1)，但只对 (0,0) 插了旗，flags=1 != 2
  // 改测试场景：(1,1) adj=2，玩家给 (0,0) 和 (2,2) 错插旗(实际只有 (0,0) 是雷, (2,2) 不是雷)
  // 让 flags=adj=2 同时邻 hidden 仍含真雷 (0,0)
  const c = initBoard(3, 3, 0);
  c.cells[idx(c, 0, 0)].mine = true; // 真雷
  c.cells[idx(c, 1, 0)].mine = true; // 真雷
  c.minesPlaced = true;
  recomputeAdj(c);
  c.cells[idx(c, 1, 1)].revealed = true; // 邻域雷数 2（(0,0)/(1,0)）
  toggleFlag(c, 0, 0); // 正确
  toggleFlag(c, 2, 2); // 误标（实际 (2,2) 是空）
  // 此时 flags=2 == adj=2，但 hidden=[0,1(空),(1,0)雷,(0,2)空,(2,0)空,(2,1)空]，
  // 点开 (1,0) 必爆
  const res = chordReveal(c, 1, 1);
  assert.equal(res.triggered, true);
  assert.equal(res.hitMine, true, '存在真雷应返回 hitMine=true');
});

test('chordReveal 对未翻开/空格/雷格不触发', () => {
  const b = initBoard(3, 3, 0);
  b.minesPlaced = true;
  // 未翻开格
  assert.equal(chordReveal(b, 0, 0).triggered, false);
  // 空格（已翻但 adj=0）
  b.cells[idx(b, 1, 1)].revealed = true;
  assert.equal(chordReveal(b, 1, 1).triggered, false);
  // 雷（已翻但 .mine=true）
  b.cells[idx(b, 0, 0)].mine = true;
  b.cells[idx(b, 0, 0)].revealed = true;
  assert.equal(chordReveal(b, 0, 0).triggered, false);
});
