const assert = require('node:assert/strict');

require('../js/generated/tap-rate.js');
const T = globalThis.TimeCoreDomain;

// 「每秒几次 × 点几秒」→ 次数 + 间隔（存储模型不变）
assert.deepEqual(T.tapRateToTiming(5, 2), { n: 10, gap: 200 });
assert.deepEqual(T.tapRateToTiming(1, 3), { n: 3, gap: 1000 });
assert.deepEqual(T.tapRateToTiming(2.5, 2), { n: 5, gap: 400 });
assert.deepEqual(T.tapRateToTiming(4.3, 7), { n: 30, gap: 233 });

// 非法输入回退：每秒 5 次 × 2 秒
assert.deepEqual(T.tapRateToTiming('', ''), { n: 10, gap: 200 });
assert.deepEqual(T.tapRateToTiming('abc', null), { n: 10, gap: 200 });

// 钳制：速率 [0.5,20]、时长 [0.5,120]、次数 [1,200]、间隔 [50,5000]
assert.deepEqual(T.tapRateToTiming(0.1, 500), { n: 60, gap: 2000 }, '钳到 0.5次/秒 × 120秒');
assert.deepEqual(T.tapRateToTiming(99, 0.1), { n: 10, gap: 50 }, '钳到 20次/秒 × 0.5秒');
assert.equal(T.tapRateToTiming(20, 120).n, 200, '上限每秒20次×120秒截断到200次');

// 长按：间隔扣除按压时长，「每秒」按按压起点计
assert.deepEqual(T.holdRateToTiming(1, 4, 800), { n: 4, gap: 200 });
assert.deepEqual(T.holdRateToTiming(0.5, 4, 800), { n: 2, gap: 1200 });
assert.deepEqual(T.holdRateToTiming(5, 2, 800), { n: 10, gap: 50 }, '高频长按间隔下限 50ms');
assert.deepEqual(T.holdRateToTiming('', '', ''), { n: 3, gap: 200 }, '默认每秒1次×3秒、按压800ms');

// 回显：存储 → 每秒/秒（1 位小数）；长按周期 = 间隔 + 按压
assert.deepEqual(T.tapTimingToRate(30, 230), { rate: 4.3, seconds: 6.9 });
assert.deepEqual(T.tapTimingToRate(10, 200), { rate: 5, seconds: 2 });
assert.deepEqual(T.tapTimingToRate(3, 500, 800), { rate: 0.8, seconds: 3.9 });
assert.deepEqual(T.tapTimingToRate('', ''), { rate: 2.5, seconds: 2 });

// 往返：回显值重新换算保持稳定（连点）
assert.deepEqual(T.tapRateToTiming(T.tapTimingToRate(30, 230).rate, T.tapTimingToRate(30, 230).seconds), { n: 30, gap: 233 });
// 往返：长按 0.5 次/秒 × 4 秒（按压 800ms）精确还原；0.769→0.8 显示舍入漂移 ≤ 100ms 周期
const holdExact = T.holdRateToTiming(0.5, 4, 800);
assert.deepEqual(T.tapTimingToRate(holdExact.n, holdExact.gap, 800), { rate: 0.5, seconds: 4 });
const holdEcho = T.tapTimingToRate(3, 500, 800);
const holdBack = T.holdRateToTiming(holdEcho.rate, holdEcho.seconds, 800);
assert.equal(Math.abs((holdBack.gap + 800) - (500 + 800)) <= 100, true, '长按往返周期漂移 ≤ 100ms');

// 速度预设：面向「看不懂毫秒」的用户一键填每秒次数
assert.equal(T.TAP_RATE_PRESETS.length >= 3, true);
assert.ok(T.TAP_RATE_PRESETS.every(p => p.rate >= T.TAP_RATE_MIN && p.rate <= T.TAP_RATE_MAX && p.label.includes('每秒')));
assert.deepEqual(T.tapRateToTiming(T.TAP_RATE_PRESETS[0].rate, 2), { n: 2, gap: 1000 });

// 边界常量存在且自洽
assert.equal(T.TAP_GAP_MIN, 50);
assert.equal(1000 / T.TAP_RATE_MAX, T.TAP_GAP_MIN);
assert.equal(T.TAP_COUNT_MAX, 200);

console.log('adb-tap-rate contract: 20 assertions passed');
