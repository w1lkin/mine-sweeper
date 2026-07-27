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

// ===== 浏览器交互与渲染（Task 4 / Task 5） =====

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

  // 触摸长按检测
  let pressTimer = null, longPressed = false;
  $board.addEventListener('touchstart', e => {
    const t = e.target.closest('.cell'); if (!t) return;
    longPressed = false;
    const i = +t.dataset.i;
    pressTimer = setTimeout(() => { longPressed = true; onCellLongPress(i); }, 400);
  });
  $board.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
  $board.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });
  $board.addEventListener('click', e => {
    const t = e.target.closest('.cell'); if (!t) return;
    if (longPressed) { longPressed = false; return; }
    onCellClick(+t.dataset.i);
  });
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
      const ts = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      li.innerHTML = `<span>${DIFF_LABEL[r.difficulty]} · ${ts}</span>` +
        `<span class="${r.result}">${r.result === 'win' ? '胜' : '负'} ${r.time}s</span>`;
      $recordList.appendChild(li);
    });
  }

  // 分享按钮：调用 share-card-generator 注入的函数（Task 5 定义）
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

  // ===== Task 5: 复用 share-card-generator 生成分享卡（离屏 canvas + 浮层） =====
  function generateShareCardShare(diff, time, finishedState) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    const W = 1200, H = 1600;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#E8F5E9'); g.addColorStop(.4, '#FFF9C4'); g.addColorStop(1, '#FFFDE7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .12;
    [
      { x: 160, y: 360, r: 200, f: '#81C784' }, { x: 960, y: 280, r: 140, f: '#A5D6A7' },
      { x: 1040, y: 1120, r: 260, f: '#FFE082' }, { x: 200, y: 1240, r: 120, f: '#81C784' },
      { x: 600, y: 200, r: 90, f: '#A5D6A7' },
    ].forEach(d => { ctx.fillStyle = d.f; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFF'; ctx.shadowColor = 'rgba(0,0,0,.08)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 12;
    function rr(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    rr(90, 240, W - 180, H - 600, 56); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const result = finishedState ? '已结束' : '进行中';
    ctx.fillStyle = '#81C784'; ctx.font = "bold 88px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = 'center'; ctx.fillText('扫雷', W / 2, 410);
    ctx.font = '90px sans-serif'; ctx.fillText('💣 🚩 💡', W / 2, 560);
    ctx.fillStyle = '#999'; ctx.font = "44px -apple-system,'PingFang SC',sans-serif";
    ctx.fillText(`${DIFF_LABEL[diff]} · 用时 ${time}s · ${result}`, W / 2, 680);
    ctx.strokeStyle = '#A5D6A7'; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(190, 760); ctx.lineTo(W - 190, 760); ctx.stroke(); ctx.setLineDash([]);
    const features = ['🎯 难度：' + DIFF_LABEL[diff], '⏱ 用时：' + time + ' 秒', '🏆 状态：' + result];
    ctx.fillStyle = '#777'; ctx.font = "40px -apple-system,'PingFang SC',sans-serif";
    features.forEach((f, i) => ctx.fillText(f, W / 2, 860 + i * 96));
    const qrImg = new Image(); qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      const qs = 280, qx = (W - qs) / 2, qy = H - 400;
      ctx.fillStyle = '#FFF'; rr(qx - 32, qy - 32, qs + 64, qs + 64, 40); ctx.fill();
      ctx.drawImage(qrImg, qx, qy, qs, qs); show();
    };
    qrImg.onerror = () => show();
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' +
      encodeURIComponent(location.href) + '&margin=8';
    function show() {
      document.getElementById('share-card-img').src = canvas.toDataURL('image/png');
      $overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }
  window.generateShareCard = generateShareCardShare;
}
