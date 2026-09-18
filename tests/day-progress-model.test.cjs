const assert = require('node:assert/strict');

require('../js/generated/day-progress-model.js');
const { dayProgress } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  // 关键时刻
  ok(dayProgress(0).frac === 0);
  ok(dayProgress(6).frac === 0.25);
  ok(dayProgress(12).frac === 0.5);
  ok(dayProgress(18).frac === 0.75);
  ok(dayProgress(21).frac === 0.875);

  // 分钟粒度：6:30 → 0.270833…
  ok(Math.abs(dayProgress(6.5).frac - 6.5 / 24) < 1e-12);

  // 一日结束夹取到 1，不越界
  ok(dayProgress(24).frac === 1);
  ok(dayProgress(30).frac === 1);

  // 负数与非数夹取到 0
  ok(dayProgress(-1).frac === 0);
  ok(dayProgress(NaN).frac === 0);

  // 单调
  ok(dayProgress(9.1).frac > dayProgress(9.05).frac);

  // 输出副本字段完整
  ok(Object.keys(dayProgress(3)).sort().join(',') === 'frac,hourFloat');

  console.log(`day-progress-model contract: ${n} assertions passed`);
})();
