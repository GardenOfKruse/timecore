const assert = require('node:assert/strict');

require('../js/generated/daypart-verse.js');
const T = globalThis.TimeCoreDomain;

// 诗库：四幕各 3 句，全部带出处、无空句
const parts = ['night', 'morning', 'day', 'evening'];
for (const p of parts) {
  assert.equal(T.DAYPART_VERSES[p].length, 3, p + ' 3 句');
  for (const v of T.DAYPART_VERSES[p]) {
    assert.ok(v.text.length >= 5 && v.text.length <= 12, '诗句长度合理: ' + v.text);
    assert.ok(v.source.length > 2, '有出处: ' + v.source);
  }
}

// 幕边界 5/11/17/23（与 daypart-theme 同族）
const at = (h, m) => { const d = new Date(2026, 9, 2, h, m || 0, 0, 0); return d.getTime(); };
assert.equal(T.daypartIndexOf(4), 0, '4 点夜');
assert.equal(T.daypartIndexOf(5), 1, '5 点晨');
assert.equal(T.daypartIndexOf(10), 1);
assert.equal(T.daypartIndexOf(11), 2, '11 点昼');
assert.equal(T.daypartIndexOf(16), 2);
assert.equal(T.daypartIndexOf(17), 3, '17 点暮');
assert.equal(T.daypartIndexOf(22), 3);
assert.equal(T.daypartIndexOf(23), 0, '23 点夜');
assert.equal(T.daypartIndexOf('x'), 0);

// 稳定伪随机：同天同幕恒同句；跨天可变；结果属于对应幕的诗库
const v1 = T.daypartVerse(at(6, 0));
const v2 = T.daypartVerse(at(10, 59));
assert.deepEqual(v1, v2, '同一天晨幕恒同句');
assert.equal(v1.daypart, 'morning');
assert.ok(T.DAYPART_VERSES.morning.some(x => x.text === v1.text));
const vNight = T.daypartVerse(at(1, 0));
assert.equal(vNight.daypart, 'night');
assert.ok(T.DAYPART_VERSES.night.some(x => x.text === vNight.text));
// 同天不同幕：句来自各自幕（不同池，daypart 字段必不同）
const vEve = T.daypartVerse(at(18, 0));
assert.equal(vEve.daypart, 'evening');
// 伪随机确实随日期变化（取 14 天晨幕样本，至少出现 2 种句子）
const seen = new Set();
for (let d = 1; d <= 14; d++) seen.add(T.daypartVerse(new Date(2026, 9, d, 6).getTime()).text);
assert.ok(seen.size >= 2, '14 天至少 2 种晨句，got ' + seen.size);
// NaN 回退当前时刻（不抛）
assert.ok(T.daypartVerse(NaN).text.length > 0);

console.log('daypart-verse contract: 25 assertions passed');
