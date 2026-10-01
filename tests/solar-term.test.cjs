const assert = require('node:assert/strict');

require('../js/generated/solar-term.js');
const T = globalThis.TimeCoreDomain;

// 二十四节气序：黄经 0° 起春分，15° 一格
assert.equal(T.SOLAR_TERMS.length, 24);
assert.equal(T.SOLAR_TERMS[0], '春分');
assert.equal(T.SOLAR_TERMS[12], '秋分');
assert.equal(T.SOLAR_TERMS[18], '冬至');

// 交节时刻 → 东八区日期（锚点选离午夜 ≥1.5h 的公认历日，防 ±15min 算法误差翻日）
const cstDate = epoch => new Date(epoch + 8 * 3600000).toISOString().slice(0, 10);
const kOf = name => T.SOLAR_TERMS.indexOf(name);
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('立春'))), '2025-02-03', '立春 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('春分'))), '2025-03-20', '春分 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('清明'))), '2025-04-04', '清明 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('夏至'))), '2025-06-21', '夏至 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('秋分'))), '2025-09-23', '秋分 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('寒露'))), '2025-10-08', '寒露 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2025, kOf('冬至'))), '2025-12-21', '冬至 2025');
assert.equal(cstDate(T.findSolarTermEpoch(2026, kOf('小寒'))), '2026-01-05', '小寒 2026');
assert.equal(cstDate(T.findSolarTermEpoch(2026, kOf('立春'))), '2026-02-04', '立春 2026');
assert.equal(cstDate(T.findSolarTermEpoch(2026, kOf('春分'))), '2026-03-20', '春分 2026');
assert.equal(cstDate(T.findSolarTermEpoch(2026, kOf('秋分'))), '2026-09-23', '秋分 2026');

// 结构：一年 24 个节气、按时间升序、相邻间隔 14.5~16.5 天
const terms2025 = T.solarTermsOfYear(2025);
assert.equal(terms2025.length, 24);
for (let i = 1; i < terms2025.length; i++) {
  assert.ok(terms2025[i].epoch > terms2025[i - 1].epoch, '升序 @' + i);
  const gap = (terms2025[i].epoch - terms2025[i - 1].epoch) / 86400000;
  assert.ok(gap > 14.4 && gap < 16.6, '间隔 14.5~16.5 天 @' + terms2025[i].name + ' got ' + gap.toFixed(2));
}
assert.equal(terms2025[0].name, '小寒', '2025 年首个节气是小寒');
assert.equal(terms2025[23].name, '冬至', '2025 年末个节气是冬至');

// 当前节气：2025-10-05 → 秋分，距寒露 3 日；跨过交节时刻即翻转
const info = T.solarTermInfo(Date.parse('2025-10-05T12:00:00+08:00'));
assert.equal(info.name, '秋分');
assert.equal(info.nextName, '寒露');
assert.equal(info.daysToNext, 3);
const hanluEpoch = T.findSolarTermEpoch(2025, kOf('寒露'));
const flipped = T.solarTermInfo(hanluEpoch + 60000);
assert.equal(flipped.name, '寒露');
assert.equal(flipped.nextName, '霜降');
const justBefore = T.solarTermInfo(hanluEpoch - 60000);
assert.equal(justBefore.name, '秋分', '交节前 1 分钟仍是秋分');

// 跨年：2026-01-01 属小寒前 → 当前是大寒之后的…2025 冬至(12/21)，下一节气是 2026 小寒
const newYear = T.solarTermInfo(Date.parse('2026-01-01T10:00:00+08:00'));
assert.equal(newYear.name, '冬至');
assert.equal(newYear.nextName, '小寒');
assert.equal(newYear.daysToNext, 4);

// 非法输入回退当前时刻 / NaN 防护
assert.equal(Number.isNaN(T.findSolarTermEpoch('x', 1)), true);
assert.equal(T.solarTermInfo(NaN).name.length > 0, true, 'NaN 回退当前时刻');

console.log('solar-term contract: 40 assertions passed');
