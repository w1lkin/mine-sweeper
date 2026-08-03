// 浏览器分支（saveRecord 调 GamePlatform.submitScore）：
// 通过临时挂 `globalThis.document` 和 `globalThis.GamePlatform` 触发 if 分支，
// 测试胜利时上报 score=base+time，失败时不调用 submitScore。

const test = require('node:test');
const assert = require('node:assert');

test('saveRecord 胜利时上报 base+time', () => {
  const calls = [];
  globalThis.document = {}; // 触发 typeof document !== 'undefined'
  globalThis.GamePlatform = {
    submitScore(gameId, score, meta) {
      calls.push({ gameId, score, meta });
      return Promise.resolve(1);
    },
  };
  // 在 require 之前没设 document，但 game.js 已经在另一个 require 里被加载过
  // —— 必须用 dynamic import 不行（cache）。改为：直接复用一个不会污染其他测试的子进程？
  // 简化方案：让 game.js 暴露的 saveRecord 在 document 存在时走云端分支，动态设 document 后再次 require 会命中缓存
  // 所以这里直接 monkey-patch 走运行时：清掉 module cache + 重新 require
  delete require.cache[require.resolve('../game.js')];
  const { saveRecord } = require('../game.js');
  try {
    saveRecord({ date: 'x', difficulty: 'easy', result: 'win', time: 6, cellsLeft: 0 });
    saveRecord({ date: 'x', difficulty: 'medium', result: 'win', time: 9, cellsLeft: 0 });
    saveRecord({ date: 'x', difficulty: 'hard', result: 'win', time: 12, cellsLeft: 0 });
  } finally {
    delete globalThis.document;
    delete globalThis.GamePlatform;
    delete require.cache[require.resolve('../game.js')];
  }
  assert.equal(calls.length, 3, '三场胜利应产生 3 次上报');
  assert.deepEqual(calls.map(c => c.score), [100006, 300009, 600012], 'score=base+time（easy/medium/hard）');
  assert.equal(calls[0].gameId, 'mine-sweeper');
  assert.equal(calls[0].meta.win, true);
});

test('saveRecord 失败时不上报（不入天梯，仅个人历史）', () => {
  const calls = [];
  globalThis.document = {};
  globalThis.GamePlatform = { submitScore: (g, s, m) => { calls.push({ g, s, m }); return Promise.resolve(1); } };
  delete require.cache[require.resolve('../game.js')];
  const { saveRecord } = require('../game.js');
  try {
    saveRecord({ date: 'x', difficulty: 'easy', result: 'lose', time: 3, cellsLeft: 5 });
    saveRecord({ date: 'x', difficulty: 'hard', result: 'lose', time: 30, cellsLeft: 99 });
  } finally {
    delete globalThis.document;
    delete globalThis.GamePlatform;
    delete require.cache[require.resolve('../game.js')];
  }
  assert.equal(calls.length, 0, '失败记录不应进入天梯');
});
