const assert = require('node:assert/strict');

require('../js/generated/moon-phase.js');
const { moonPhase, MOON_SYNODIC_DAYS, MOON_REFERENCE_NEW_MOON_MS } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = (pass) => { assert.ok(pass); n++; };
  const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

  // 参考新月时刻 → phase 0
  const ref = moonPhase(MOON_REFERENCE_NEW_MOON_MS);
  ok(ref.phase === 0 && ref.ageDays === 0 && ref.angleRad === 0 && ref.waxing === true);

  // 1/4 朔望周期 → 上弦（盈）
  const q1 = moonPhase(MOON_REFERENCE_NEW_MOON_MS + MOON_SYNODIC_DAYS / 4 * 86400000);
  ok(close(q1.phase, 0.25) && q1.waxing === true && close(q1.ageDays, MOON_SYNODIC_DAYS / 4));

  // 1/2 → 满月；3/4 → 下弦（亏）。盈亏边界语义：phase<0.5 为盈，恰半点受浮点影响，用半点+偏移验证
  const full = moonPhase(MOON_REFERENCE_NEW_MOON_MS + MOON_SYNODIC_DAYS / 2 * 86400000);
  ok(close(full.phase, 0.5) && close(full.angleRad, Math.PI));
  ok(moonPhase(MOON_REFERENCE_NEW_MOON_MS + (MOON_SYNODIC_DAYS / 2 + 0.01) * 86400000).waxing === false);
  const q3 = moonPhase(MOON_REFERENCE_NEW_MOON_MS + MOON_SYNODIC_DAYS / 4 * 3 * 86400000);
  ok(close(q3.phase, 0.75) && q3.waxing === false);

  // 真实天文锚点 1：2024-04-08 18:21 UTC 日全食 = 新月（距 0/1 回绕边界 <0.02，即约 ±0.6 天内）
  const eclipse = moonPhase(Date.UTC(2024, 3, 8, 18, 21, 0));
  ok(Math.min(eclipse.phase, 1 - eclipse.phase) < 0.02);

  // 真实天文锚点 2：2024-04-23 23:49 UTC 满月
  const fullMoon = moonPhase(Date.UTC(2024, 3, 23, 23, 49, 0));
  ok(Math.abs(fullMoon.phase - 0.5) < 0.02);

  // 早于参考历元 → 仍收敛到 [0,1)
  const before = moonPhase(0);
  ok(before.phase >= 0 && before.phase < 1);

  // 相位对时间单调（同周期内）
  const a = moonPhase(MOON_REFERENCE_NEW_MOON_MS + 3 * 86400000);
  const b = moonPhase(MOON_REFERENCE_NEW_MOON_MS + 4 * 86400000);
  ok(b.phase > a.phase && b.ageDays > a.ageDays);

  // 轨道角 = phase × 2π
  const c = moonPhase(MOON_REFERENCE_NEW_MOON_MS + 1000);
  ok(close(c.angleRad, c.phase * Math.PI * 2));

  // 照亮比例：新月 0 / 上弦 0.5 / 满月 1
  ok(ref.illum === 0);
  ok(Math.abs(q1.illum - 0.5) < 1e-9);
  ok(Math.abs(full.illum - 1) < 1e-9);

  // 输出为副本且字段完整
  const keys = Object.keys(ref).sort().join(',');
  ok(keys === 'ageDays,angleRad,illum,phase,waxing');

  // 确定性
  ok(close(moonPhase(1234567890123).phase, moonPhase(1234567890123).phase));

  console.log(`moon-phase contract: ${n} assertions passed`);
})();
