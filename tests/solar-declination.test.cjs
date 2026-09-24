const assert = require('node:assert/strict');

require('../js/generated/solar-declination.js');
const { solarDeclination, SOLAR_OBLIQUITY_DEG } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const close = (a, b, eps) => Math.abs(a - b) <= eps;

  // 二分二至锚点
  ok(close(solarDeclination(80), 0, 0.6));    // 春分
  ok(close(solarDeclination(172), 23.44, 1.5));   // 夏至
  ok(close(solarDeclination(355), -23.44, 1.5));  // 冬至
  ok(close(solarDeclination(266), 0, 1.5));   // 秋分（N≈266）

  // 区间钳制与符号：夏半年为正、冬半年为负
  for (let d = 1; d <= 365; d++) {
    const v = solarDeclination(d);
    ok(v >= -SOLAR_OBLIQUITY_DEG && v <= SOLAR_OBLIQUITY_DEG);
  }
  ok(solarDeclination(180) > 0 && solarDeclination(10) < 0);

  // 周期性：N 与 N+365 相同；非法入参落 0
  ok(close(solarDeclination(172), solarDeclination(172 + 365), 1e-9));
  ok(solarDeclination(NaN) === 0 && solarDeclination(-700) >= -SOLAR_OBLIQUITY_DEG);

  // 单调段：春分→夏置间递增
  ok(solarDeclination(130) > solarDeclination(100) && solarDeclination(172) > solarDeclination(130));

  console.log(`solar-declination contract: ${n} assertions passed`);
})();
