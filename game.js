'use strict';

// ===== 纯逻辑：无 DOM 依赖，可在 node 下测试 =====

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
  // 候选排除安全格与 8 邻域，保证首点安全
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

// ===== 最近 10 次记录（localStorage） =====

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initBoard, placeMines, forEachNeighbor, idx,
    reveal, toggleFlag, remainingMines, isWin,
    loadRecords, saveRecord, MAX_RECORDS, RECORDS_KEY,
  };
}
