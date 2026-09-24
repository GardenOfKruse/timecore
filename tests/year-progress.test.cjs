const assert = require('node:assert/strict');

require('../js/generated/year-progress.js');
const { isLeapYear, dayOfYear, yearProgress } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  // 闰年规则
  ok(isLeapYear(2024) === true && isLeapYear(2000) === true && isLeapYear(1900) === false && isLeapYear(2026) === false);
  ok(isLeapYear(0) === false && isLeapYear(NaN) === false && isLeapYear(2024.5) === false);

  // 天序号：平/闰年、年初年末、2 月末
  ok(dayOfYear(2026, 1, 1) === 1);
  ok(dayOfYear(2026, 12, 31) === 365);
  ok(dayOfYear(2024, 12, 31) === 366);
  ok(dayOfYear(2026, 2, 28) === 59);
  ok(dayOfYear(2024, 2, 28) === 59 && dayOfYear(2024, 2, 29) === 60 && dayOfYear(2024, 3, 1) === 61);
  ok(dayOfYear(2026, 9, 25) === 31 + 28 + 31 + 30 + 31 + 30 + 31 + 31 + 25);
  ok(dayOfYear(2026, 13, 1) === 0 && dayOfYear(2026, 0, 10) === 0 && dayOfYear(2026, 2, 30) === 61);   // 越界日按累进表钳在表内计算

  // frac：年初≈0、年末→1、日环内插连续
  const y1 = yearProgress(2026, 1, 0);
  ok(y1.frac < 0.001 && y1.dayOfYear === 1 && y1.leapYear === false);
  const yEnd = yearProgress(2026, 365, 1);
  ok(yEnd.frac === 1);
  ok(Math.abs(yearProgress(2026, 268, 0.5).frac - (267.5 / 365)) < 1e-12);
  const leapSt = yearProgress(2024, 60, 0.25);
  ok(leapSt.leapYear === true && Math.abs(leapSt.frac - (59.25 / 366)) < 1e-12);

  // 非法 doy 钳到 1；非法 dayFrac 钳到 [0,1]
  ok(yearProgress(2026, 0, 0).dayOfYear === 1 && yearProgress(2026, 999, 0).dayOfYear === 1);
  ok(yearProgress(2026, 100, 5).frac === yearProgress(2026, 100, 1).frac);

  // 单调：同一日内 dayFrac 增大 frac 增大
  ok(yearProgress(2026, 100, 0.6).frac > yearProgress(2026, 100, 0.5).frac);

  // 输出副本字段完整
  ok(Object.keys(y1).sort().join(',') === 'dayOfYear,frac,leapYear');

  console.log(`year-progress contract: ${n} assertions passed`);
})();
