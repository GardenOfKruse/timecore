const assert = require('node:assert/strict');

require('../js/generated/shichen.js');
const T = globalThis.TimeCoreDomain;

// 序表：十二支 + 雅称
assert.deepEqual(T.SHICHEN_BRANCHES, ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
assert.equal(T.SHICHEN_ALIASES[0], '夜半');
assert.equal(T.SHICHEN_ALIASES[9], '日入');
assert.equal(T.SHICHEN_ALIASES[11], '人定');

// 小时 → 时辰：23/0 同属子，边界逐点
assert.equal(T.shichenOfHour(23), 0, '23 点入子');
assert.equal(T.shichenOfHour(0), 0);
assert.equal(T.shichenOfHour(1), 1, '1 点入丑');
assert.equal(T.shichenOfHour(2), 1);
assert.equal(T.shichenOfHour(3), 2);
assert.equal(T.shichenOfHour(5), 3, '5 点入卯');
assert.equal(T.shichenOfHour(12), 6, '12 点仍午');
assert.equal(T.shichenOfHour(13), 7, '13 点入未');
assert.equal(T.shichenOfHour(17), 9, '17 点入酉');
assert.equal(T.shichenOfHour(19), 10, '19 点入戌');
assert.equal(T.shichenOfHour(22), 11, '22 点仍亥');
assert.equal(T.shichenOfHour('x'), 0, '非法回退子');

// 信息：锚定时刻（本地时区语义，用本地 Date 构造避免时区漂移）
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
let s = T.shichenInfo(at(23, 30));
assert.equal(s.branch, '子');
assert.equal(s.alias, '夜半');
assert.equal(s.geng, '三更', '子时属三更');
assert.equal(s.nextBranch, '丑');
s = T.shichenInfo(at(0, 30));
assert.equal(s.branch, '子');
assert.equal(s.startEpoch, at(23, 0) - 86400000 + 0, '凌晨的子时始于前一日 23:00');
s = T.shichenInfo(at(13, 0));
assert.equal(s.branch, '未');
assert.equal(s.alias, '日昳');
assert.equal(s.geng, null, '白天无更');
s = T.shichenInfo(at(17, 0));
assert.equal(s.branch, '酉');
assert.equal(s.alias, '日入');
s = T.shichenInfo(at(19, 30));
assert.equal(s.branch, '戌');
assert.equal(s.alias, '黄昏');
assert.equal(s.geng, '一更');
s = T.shichenInfo(at(3, 30));
assert.equal(s.branch, '寅');
assert.equal(s.geng, '五更');
s = T.shichenInfo(at(5, 0));
assert.equal(s.branch, '卯');
assert.equal(s.geng, null, '5 点出更');

// 分钟数：23:50 距丑时（1:00 开）70 分（向上取整）
s = T.shichenInfo(at(23, 50));
assert.equal(s.minutesToNext, 70);
s = T.shichenInfo(at(17, 0));
assert.equal(s.minutesToNext, 120, '时辰伊始距下一时辰 120 分');

// 五更直查
assert.equal(T.gengOfHour(20), '一更');
assert.equal(T.gengOfHour(22), '二更');
assert.equal(T.gengOfHour(2), '四更');
assert.equal(T.gengOfHour(12), null);
assert.equal(T.gengOfHour('x'), null);

// NaN 回退当前时刻（不抛）
assert.ok(T.shichenInfo(NaN).branch.length === 1);

console.log('shichen contract: 36 assertions passed');
