const test = require('node:test');
const assert = require('node:assert');
const {
  initBoard, placeMines, forEachNeighbor, idx,
  reveal, toggleFlag, isWin, remainingMines,
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
