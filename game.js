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
        hidden.forEach(n => { n.flagged = true; });
      }
    }
  }
}

function remainingMines(board) {
  const flags = board.cells.filter(c => c.flagged).length;
  return board.mineCount - flags;
}

function isWin(board) {
  return board.cells.every(c => c.mine || c.revealed);
}

// ===== 最近 10 次记录（云端 getMyScores / submitScore）=====

const RECORDS_KEY = 'minesweeper_records';
const MAX_RECORDS = 10;

// 浏览器环境：战绩上报云端；Node 环境（测试）：保留内存版本以验证排序/截断逻辑
const _memRecords = [];

function loadRecords() {
  if (typeof document === 'undefined') {
    return _memRecords.slice();
  }
  return []; // 浏览器历史改由 GamePlatform.getMyScores 异步渲染
}

function saveRecord(record) {
  if (typeof document !== 'undefined' && typeof GamePlatform !== 'undefined') {
    // 战绩上报：仅胜利计入天梯，score = 难度基数 + 用时（asc，越小越好，与 registry 一致）
    // 失败不入天梯（避免 base+999999 的失败条霸榜），仅作个人历史保留（getMyScores）
    if (record.result !== 'win') return [];
    const base = { easy: 100000, medium: 300000, hard: 600000 }[record.difficulty] || 100000;
    const score = base + (record.time || 0);
    try {
      GamePlatform.submitScore('mine-sweeper', score, {
        difficulty: record.difficulty, time: record.time, win: true, cellsLeft: record.cellsLeft,
      });
    } catch (e) { console.warn('submit score failed:', e); }
    return [record];
  }
  // Node 测试路径：保留排序/截断逻辑
  _memRecords.push(record);
  _memRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (_memRecords.length > MAX_RECORDS) _memRecords.length = MAX_RECORDS;
  return _memRecords.slice();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initBoard, placeMines, forEachNeighbor, idx,
    reveal, toggleFlag, remainingMines, isWin, autoFlag,
    loadRecords, saveRecord, MAX_RECORDS, RECORDS_KEY,
    _resetRecords: () => { _memRecords.length = 0; },
  };
}

// ===== 浏览器交互与渲染（Task 4 / Task 5） =====

if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
  const DIFFS = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard:   { rows: 16, cols: 30, mines: 99 },
  };
  const DIFF_LABEL = { easy: '初级', medium: '中级', hard: '高级' };

  let board = null;
  let currentDiff = 'easy';
  let timer = 0, timerId = null, started = false, finished = false, lastWin = null;
  let autoFlagOn = true; // 默认开；登录后从云端 KV 恢复
  if (typeof GamePlatform !== 'undefined') {
    GamePlatform.getKV('minesweeper_autoflag').then((v) => {
      if (v === false || v === 'false') { autoFlagOn = false; if ($autoFlagToggle) $autoFlagToggle.checked = false; }
    }).catch(() => {});
  }
  let paused = false;

  const $board = document.getElementById('board');
  const $mineCount = document.getElementById('mine-count');
  const $timer = document.getElementById('timer');
  const $overlay = document.getElementById('share-overlay');
  const $boardWrap = document.querySelector('.board-wrap');
  const $autoFlagToggle = document.getElementById('autoflag-toggle');
  const $pauseBtn = document.getElementById('pause-btn');
  const $immerseBtn = document.getElementById('immerse-btn');
  const $immerseExit = document.getElementById('immerse-exit');
  const $bsb = document.getElementById('board-scrollbar');
  const $bsbThumb = document.getElementById('bsb-thumb');

  function startTimer() {
    if (timerId) return;
    started = true;
    timerId = setInterval(() => { timer++; $timer.textContent = '⏱ ' + timer; }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function pauseGame() {
    if (finished || paused) return;
    paused = true;
    stopTimer();
    buildFakeSheet();
    if ($boardWrap) $boardWrap.classList.add('paused');
  }

  // 暂停时生成一张伪装的预算表，避免摸鱼露馅
  function buildFakeSheet() {
    const grid = document.getElementById('fx-grid');
    if (!grid) return;
    const cols = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const fields = ['', '项目', '负责人', '预算(万)', '已支出', '进度', '状态', '备注'];
    const owners = ['张伟', '李娜', '王芳', '刘洋', '陈静', '赵磊'];
    const items = ['市场推广', '研发投入', '设备采购', '差旅费', '外包服务', '培训', '运维', '咨询费'];
    const states = [['进行中', '#b26a00'], ['已完成', '#2e7d32'], ['待启动', '#888']];
    let html = '<div class="fx-row fx-coord">' +
      cols.map(c => `<div class="fx-cell">${c}</div>`).join('') + '</div>';
    html += '<div class="fx-row fx-head">' +
      fields.map(f => `<div class="fx-cell">${f}</div>`).join('') + '</div>';
    for (let i = 0; i < 14; i++) {
      const budget = Math.floor(Math.random() * 90) + 10;
      const spent = Math.floor(budget * (Math.random() * 0.9 + 0.05));
      const prog = Math.floor(spent / budget * 100);
      const st = states[Math.floor(Math.random() * states.length)];
      const cells = [
        i + 1,
        items[Math.floor(Math.random() * items.length)],
        owners[Math.floor(Math.random() * owners.length)],
        budget, spent, prog + '%',
        `<span style="color:${st[1]}">${st[0]}</span>`, '—',
      ];
      html += '<div class="fx-row">' +
        cells.map(c => `<div class="fx-cell">${c}</div>`).join('') + '</div>';
    }
    grid.innerHTML = html;
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    if ($boardWrap) $boardWrap.classList.remove('paused');
    if (started && !finished) startTimer(); // 继续计时
  }

  // 失焦自动暂停：切到桌面/其他应用或切换标签页时，显示伪装表
  window.addEventListener('blur', () => { if (started && !finished && !paused) pauseGame(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !finished && !paused) pauseGame();
  });

  // 常驻自定义水平滚动条：仅在棋盘横向溢出时显示，始终可见，可拖拽
  function updateScrollbar() {
    if (!$board || !$bsb) return;
    const overflow = $board.scrollWidth - $board.clientWidth;
    if (overflow > 1) {
      $bsb.classList.add('show');
      const ratio = $board.clientWidth / $board.scrollWidth;
      const thumbW = Math.max(24, $bsb.clientWidth * ratio);
      $bsbThumb.style.width = thumbW + 'px';
      const maxScroll = $board.scrollWidth - $board.clientWidth;
      const maxThumb = $bsb.clientWidth - thumbW;
      const x = maxScroll > 0 ? ($board.scrollLeft / maxScroll) * maxThumb : 0;
      $bsbThumb.style.transform = 'translateX(' + x + 'px)';
    } else {
      $bsb.classList.remove('show');
    }
  }
  $board.addEventListener('scroll', updateScrollbar);
  window.addEventListener('resize', updateScrollbar);
  let bsbDragging = false, bsbStartX = 0, bsbThumbStartX = 0;
  $bsbThumb.addEventListener('pointerdown', e => {
    bsbDragging = true; bsbStartX = e.clientX;
    bsbThumbStartX = parseFloat(($bsbThumb.style.transform.match(/translateX\(([-\d.]+)px\)/) || [])[1] || 0);
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (!bsbDragging) return;
    const thumbW = $bsbThumb.offsetWidth;
    const maxThumb = $bsb.clientWidth - thumbW;
    let x = bsbThumbStartX + (e.clientX - bsbStartX);
    x = Math.max(0, Math.min(maxThumb, x));
    $bsbThumb.style.transform = 'translateX(' + x + 'px)';
    const maxScroll = $board.scrollWidth - $board.clientWidth;
    $board.scrollLeft = maxScroll * (x / (maxThumb || 1));
  });
  window.addEventListener('pointerup', () => { bsbDragging = false; });

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
    updateScrollbar();
  }

  function newGame(diff) {
    currentDiff = diff;
    const d = DIFFS[diff];
    board = initBoard(d.rows, d.cols, d.mines);
    timer = 0; started = false; finished = false; stopTimer();
    paused = false;
    if ($boardWrap) $boardWrap.classList.remove('paused');
    $timer.textContent = '⏱ 0';
    document.querySelectorAll('.difficulty button').forEach(b =>
      b.classList.toggle('active', b.dataset.diff === diff));
    render();
  }

  function endGame(win) {
    finished = true; lastWin = win ? 'win' : 'lose'; stopTimer();
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
    showResult(win);
  }

  // 结算浮层（纯 DOM，不依赖 canvas，iOS 微信也能可靠显示）
  function showResult(win) {
    const $ro = document.getElementById('result-overlay');
    if (!$ro) return;
    document.getElementById('result-emoji').textContent = win ? '🎉' : '💥';
    document.getElementById('result-title').textContent = win ? '通关！' : '踩雷了';
    document.getElementById('result-sub').textContent = `${DIFF_LABEL[currentDiff]} · 用时 ${timer} 秒`;
    $ro.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function onCellClick(i) {
    if (finished || paused) return;
    const r = Math.floor(i / board.cols), c = i % board.cols;
    const cell = board.cells[i];
    if (cell.flagged) return;
    startTimer();
    const res = reveal(board, r, c);
    if (res.hitMine) { render(); endGame(false); return; }
    if (autoFlagOn) autoFlag(board);
    render();
    if (isWin(board)) endGame(true);
  }

  function onCellLongPress(i) {
    if (finished || paused) return;
    const r = Math.floor(i / board.cols), c = i % board.cols;
    const cell = board.cells[i];
    if (cell.revealed) return;
    toggleFlag(board, r, c);
    if (autoFlagOn) autoFlag(board);
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
    e.stopPropagation(); // render() 会重建 DOM，阻断冒泡避免误触 document 暂停逻辑
  });
  $board.addEventListener('contextmenu', e => {
    e.preventDefault();
    const t = e.target.closest('.cell'); if (!t) return;
    onCellLongPress(+t.dataset.i);
    e.stopPropagation();
  });

  // 分享按钮：调用 share-card-generator 注入的函数（Task 5 定义）
  document.getElementById('share-btn').addEventListener('click', () => {
    if (typeof window.generateShareCard === 'function') window.generateShareCard(currentDiff, timer, lastWin || 'playing');
    else alert('分享功能准备中');
  });
  document.getElementById('share-close').addEventListener('click', () =>
    $overlay.classList.remove('active'));
  $overlay.addEventListener('click', e => { if (e.target === $overlay) $overlay.classList.remove('active'); });
  document.getElementById('result-again').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.remove('active');
    document.body.style.overflow = '';
    newGame(currentDiff);
  });
  document.getElementById('result-share').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.remove('active');
    document.body.style.overflow = '';
    if (typeof window.generateShareCard === 'function') window.generateShareCard(currentDiff, timer, lastWin || 'playing');
    else alert('分享功能准备中');
  });
  document.querySelectorAll('.difficulty button').forEach(b =>
    b.addEventListener('click', () => newGame(b.dataset.diff)));
  document.getElementById('restart').addEventListener('click', () => newGame(currentDiff));

  $pauseBtn.addEventListener('click', () => { if (paused) resumeGame(); else pauseGame(); });

  document.addEventListener('click', (e) => {
    if (finished) return;
    if (e.target.closest('.board-scrollbar')) return; // 滚动条交互不触发暂停/恢复
    const onBoard = e.target.closest('.board-wrap');
    if (paused) {
      if (onBoard) resumeGame(); // 单击牌面（含遮罩）取消暂停
      return;
    }
    if (onBoard) return;                 // 正常棋盘点击由 board 处理器处理
    if (e.target.closest('button, .toggle, .share-overlay, .gp-tabbar, a')) return; // 控件/链接放行，不暂停
    pauseGame();                         // 点空白区 => 暂停
  });

  $autoFlagToggle.checked = autoFlagOn;
  $autoFlagToggle.addEventListener('change', () => {
    autoFlagOn = $autoFlagToggle.checked;
    try { GamePlatform.setKV('minesweeper_autoflag', autoFlagOn); } catch (e) {}
    if (autoFlagOn && board) { autoFlag(board); render(); }
  });

  function setImmerse(on) {
    document.body.classList.toggle('immersive', on);
    $immerseBtn.textContent = on ? '退出' : '🙈 沉浸';
    try { GamePlatform.setKV('minesweeper_immersive', on); } catch (e) {}
  }
  $immerseBtn.addEventListener('click', () => setImmerse(!document.body.classList.contains('immersive')));
  $immerseExit.addEventListener('click', () => setImmerse(false));
  if (typeof GamePlatform !== 'undefined') {
    GamePlatform.getKV('minesweeper_immersive').then((v) => { if (v === true || v === '1') setImmerse(true); }).catch(() => {});
  }

  // 硬登录门：未登录不能玩
  GamePlatform.init();
  GamePlatform.mountGate({ gameId: 'mine-sweeper' }).then(() => {
    newGame('easy');
  });

  // ===== Task 5: 复用 share-card-generator 生成分享卡（离屏 canvas + 浮层） =====
  // 根据难度与用时长短生成夸赞评语
  const PRAISE_THRESHOLDS = {
    easy:   [15, 30, 60],
    medium: [60, 120, 240],
    hard:   [120, 300, 600],
  };
  const PRAISE_TEXT = {
    easy:   ['🚀 神级手速！这反应绝了', '💪 太强了，一扫即净', '👍 稳扎稳打，漂亮通关', '🌟 通关就是胜利，下次更快'],
    medium: ['🚀 大师级操作，雷区如履平地', '💪 行云流水，佩服', '👍 稳稳通关，厉害', '🌟 成功扫清，继续加油'],
    hard:   ['🚀 人形雷达！99 雷全拿下', '💪 硬核通关，强到离谱', '👍 临危不乱，漂亮', '🌟 极限挑战达成，赞'],
  };
  function praise(diff, time) {
    const t = PRAISE_THRESHOLDS[diff] || PRAISE_THRESHOLDS.easy;
    const p = PRAISE_TEXT[diff] || PRAISE_TEXT.easy;
    if (time < t[0]) return p[0];
    if (time < t[1]) return p[1];
    if (time < t[2]) return p[2];
    return p[3];
  }
  function generateShareCard(diff, time, state) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    const W = 1200, H = 1600;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#F3F3F3'); g.addColorStop(1, '#E8E8E8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .14;
    [
      { x: 160, y: 360, r: 200, f: '#4472C4' }, { x: 960, y: 280, r: 140, f: '#9DC3E6' },
      { x: 1040, y: 1120, r: 260, f: '#B4C7E7' }, { x: 200, y: 1240, r: 120, f: '#4472C4' },
      { x: 600, y: 200, r: 90, f: '#9DC3E6' },
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
    const result = state === 'win' ? '🎉 通关' : state === 'lose' ? '💥 失败' : '进行中';
    const praiseText = state === 'win' ? praise(diff, time)
      : state === 'lose' ? '再接再厉，下次一定通关'
      : '正在进行，加油！';
    ctx.fillStyle = '#4472C4'; ctx.font = "bold 88px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = 'center'; ctx.fillText('扫雷', W / 2, 410);
    ctx.font = '90px sans-serif'; ctx.fillText('💣 🚩 💡', W / 2, 560);
    ctx.fillStyle = '#555'; ctx.font = "44px -apple-system,'PingFang SC',sans-serif";
    ctx.fillText(`${DIFF_LABEL[diff]} · 用时 ${time}s · ${result}`, W / 2, 680);
    ctx.strokeStyle = '#C9D3E5'; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
    ctx.beginPath(); ctx.moveTo(190, 760); ctx.lineTo(W - 190, 760); ctx.stroke(); ctx.setLineDash([]);
    const features = ['🎯 难度：' + DIFF_LABEL[diff], '⏱ 用时：' + time + ' 秒', '💬 ' + praiseText];
    ctx.fillStyle = '#333'; ctx.font = "40px -apple-system,'PingFang SC',sans-serif";
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
      const img = document.getElementById('share-card-img');
      try { img.src = canvas.toDataURL('image/png'); img.style.display = ''; }
      catch (e) { img.style.display = 'none'; } // iOS 跨域 QR 污染 canvas 时降级，浮层仍显示
      $overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }
    window.generateShareCard = generateShareCard;

    // ===== 社交平台接入（game-api SDK）=====
    // 在线人数与个人用户栏已移除，统一收口到小游戏总入口；
    // 此处仅保留天梯榜渲染 + 心跳上报（供总入口展示全局在线）。
    // 天梯榜按难度分组（初级/中级/高级），各取榜首。
    (function social() {
      const GP = window.GamePlatform;
      const GAME_ID = 'mine-sweeper';
      if (!GP) return;
      const DEFAULT_AV = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const fmtScore = s => (typeof s === 'number' && !Number.isNaN(s)) ? (Number.isInteger(s) ? String(s) : s.toFixed(1)) : s;

      function rankBadge(i) {
        const medals = ['🥇', '🥈', '🥉'];
        return i < 3 ? medals[i] : '<span class="gp-rank">' + (i + 1) + '</span>';
      }

      async function loadLB() {
        const ol = document.getElementById('gp-lb-list'); if (!ol) return;
        try {
          const diffs = [
            { key: 'easy', label: '初级 9×9' },
            { key: 'medium', label: '中级 16×16' },
            { key: 'hard', label: '高级 30×16' },
          ];
          const results = await Promise.all(
            diffs.map(d => GP.getLeaderboard(GAME_ID, 3, d.key).then(items => ({ ...d, items })))
          );
          const hasAny = results.some(r => r.items && r.items.length > 0);
          if (!hasAny) { ol.innerHTML = '<li class="gp-empty">暂无记录，快来抢榜首！</li>'; return; }
          ol.innerHTML = results.map(r => {
            let html = '<li class="gp-lb-diff">' + r.label + '</li>';
            if (!r.items || !r.items.length) {
              html += '<li class="gp-empty gp-lb-sub">暂无记录</li>';
            } else {
              r.items.forEach((it, i) => {
                html += '<li><span class="gp-rank">' + rankBadge(i) + '</span>' +
                  '<img class="gp-oa" src="' + (it.avatar_url || DEFAULT_AV) + '" onerror="this.style.background=\'#e0e0e0\'" style="background:#e0e0e0">' +
                  '<span class="gp-lbn">' + esc(it.nickname || '匿名') + '</span>' +
                  '<span class="gp-score">' + fmtScore(it.score) + 's</span></li>';
              });
            }
            return html;
          }).join('');
        } catch (e) {}
      }

      if (GP.getToken()) GP.startHeartbeat(GAME_ID);
      loadLB(); setInterval(loadLB, 15000);
    })();
  }
