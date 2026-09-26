const assert = require('node:assert/strict');

require('../js/generated/gap-model.js');
const { evaluateGap, formatGap, GAP_MIN_MS } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const MIN = GAP_MIN_MS;

  // 裂缝判定：>90s 算、≤90s 不算、边界精确
  ok(evaluateGap(1000, 1000 + MIN + 1).crossed === true);
  ok(evaluateGap(1000, 1000 + MIN).crossed === false);
  ok(evaluateGap(1000, 1000 + 5000).crossed === false);
  ok(evaluateGap(1000, 1000 + 3600 * 1000).crossed === true);

  // gapMs 计算
  ok(evaluateGap(1000, 1000 + 91000).gapMs === 91000);
  ok(evaluateGap(1000, 999).gapMs === 0 && evaluateGap(1000, 999).crossed === false);   // 时间倒退
  ok(evaluateGap(1000, 1000).gapMs === 0);

  // 非法 prev：0/负数/NaN/非数
  ok(evaluateGap(0, 5000).crossed === false && evaluateGap(0, 5000).gapMs === 0);
  ok(evaluateGap(-5, 5000).crossed === false);
  ok(evaluateGap(NaN, 5000).crossed === false);
  ok(evaluateGap('x', 5000).crossed === false);

  // 自定义阈值
  ok(evaluateGap(1000, 1000 + 50000, 40000).crossed === true);
  ok(evaluateGap(1000, 1000 + 50000, 60000).crossed === false);
  ok(evaluateGap(1000, 1000 + 50000, -1).crossed === false);   // 非法阈值落默认 90s：50s 不触发
  ok(evaluateGap(1000, 1000 + 200000, -1).crossed === true && evaluateGap(1000, 1000 + 200000, -1).crossed === evaluateGap(1000, 1000 + 200000).crossed);

  // formatGap
  ok(formatGap(42000) === '42s');
  ok(formatGap(5 * 60000) === '5m');
  ok(formatGap(2 * 3600000 + 13 * 60000) === '2h13m');
  ok(formatGap(0) === '' && formatGap(-1) === '');

  // 字段完整
  ok(Object.keys(evaluateGap(1000, 2000)).sort().join(',') === 'crossed,gapMs');

  console.log(`gap-model contract: ${n} assertions passed`);
})();
