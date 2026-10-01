const assert = require('node:assert/strict');

require('../js/generated/meteor-calendar.js');
const T = globalThis.TimeCoreDomain;

// 目录：三大知名流星雨、窗口固定
assert.equal(T.METEOR_SHOWERS.length, 3);
assert.equal(T.METEOR_SHOWERS[0].name, '象限仪座流星雨');
assert.equal(T.METEOR_SHOWERS[1].name, '英仙座流星雨');
assert.equal(T.METEOR_SHOWERS[2].name, '双子座流星雨');

// 峰值窗口判定（东八区日界）：含首尾两天
const at = cst => Date.parse(cst);
assert.equal(T.meteorShowerTonight(at('2025-08-12T23:00:00+08:00')).name, '英仙座流星雨');
assert.equal(T.meteorShowerTonight(at('2025-08-13T23:59:00+08:00')).name, '英仙座流星雨', '窗口末日含当天深夜');
assert.equal(T.meteorShowerTonight(at('2025-08-14T00:01:00+08:00')), null, '次日即出窗');
assert.equal(T.meteorShowerTonight(at('2025-08-11T23:59:00+08:00')), null, '前夜未入窗');
assert.equal(T.meteorShowerTonight(at('2025-12-13T22:00:00+08:00')).name, '双子座流星雨');
assert.equal(T.meteorShowerTonight(at('2025-12-14T20:00:00+08:00')).name, '双子座流星雨');
assert.equal(T.meteorShowerTonight(at('2026-01-03T21:00:00+08:00')).name, '象限仪座流星雨');
assert.equal(T.meteorShowerTonight(at('2026-01-04T23:30:00+08:00')).name, '象限仪座流星雨');
// 非峰值夜：随机抽 5 个日期全 null
for (const cst of ['2025-10-02', '2026-05-20', '2026-03-15', '2026-02-14', '2025-11-30']) {
  assert.equal(T.meteorShowerTonight(at(cst + 'T22:00:00+08:00')), null, '非峰值夜 ' + cst);
}
// 跨年边界：元旦不误报象限仪（窗口 1/3 起）
assert.equal(T.meteorShowerTonight(at('2026-01-01T23:00:00+08:00')), null);
// NaN 防护
assert.equal(T.meteorShowerTonight(NaN), null);

console.log('meteor-calendar contract: 18 assertions passed');
