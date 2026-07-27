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
    saveRecord({
      date: `2026-07-27T10:${String(i).padStart(2, '0')}:00`,
      difficulty: 'easy', result: 'win', time: i, cellsLeft: 0,
    });
  }
  const recs = loadRecords();
  assert.equal(recs.length, 10, '最多保留 10 条');
  assert.equal(recs[0].time, 11, '第一条应为最新');
  assert.equal(recs[9].time, 2, '最旧的两条（0,1）应被挤出');
});

test('loadRecords 无数据时返回空数组', () => {
  delete store['minesweeper_records'];
  assert.deepEqual(loadRecords(), []);
});

test('saveRecord 按时间倒序排列', () => {
  delete store['minesweeper_records'];
  saveRecord({ date: '2026-07-27T10:00:00', difficulty: 'easy', result: 'lose', time: 5, cellsLeft: 3 });
  saveRecord({ date: '2026-07-27T12:00:00', difficulty: 'medium', result: 'win', time: 9, cellsLeft: 0 });
  const recs = loadRecords();
  assert.equal(recs.length, 2);
  assert.equal(recs[0].time, 9, '较新的 12:00 应在前');
});
