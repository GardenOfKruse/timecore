const assert = require('node:assert/strict');

require('../js/generated/hour-crossing.js');
const { hourCrossed } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const H = 3600000;
  const base = Date.UTC(2026, 8, 19, 10, 0, 0);   // 整点锚

  // 同一小时内 → false
  ok(hourCrossed(base, base + H - 1) === false);
  ok(hourCrossed(base, base) === false);

  // 跨过一个整点 → true（无论跨过后过了多久）
  ok(hourCrossed(base + H - 1, base + H) === true);
  ok(hourCrossed(base, base + H + 5) === true);

  // 错过多个整点（睡眠/挂起）→ 仍只算一次
  ok(hourCrossed(base, base + 7 * H + 3) === true);
  ok(hourCrossed(0, base + 1000 * H) === true);

  // 时间倒退 / 非法输入 → false
  ok(hourCrossed(base + H, base) === false);
  ok(hourCrossed(NaN, base) === false);
  ok(hourCrossed(base, NaN) === false);

  // 连续两次调用不重复触发：用桶号记忆的调用方模式
  let last = base;
  let fired = 0;
  for (const t of [base + 1, base + H - 1, base + H + 1, base + H + 2]) {
    if (hourCrossed(last, t)) { fired++; last = t; }
  }
  ok(fired === 1);

  // 用法陷阱锁定：prev 必须是真实 epoch 而非小时桶号——桶号会被视为 1970 年（桶 0），对真实 epoch 永远判"跨界"（v1.10.0 实际踩过的坑）
  ok(hourCrossed(Math.floor(base / H), base) === true);

  console.log(`hour-crossing contract: ${n} assertions passed`);
})();
