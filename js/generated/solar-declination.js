"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    TimeCoreDomain.SOLAR_OBLIQUITY_DEG = 23.44;
    // 太阳赤纬近似（度）：decl ≈ ε·sin(360°·(N-80)/365)，N 为 1-based 日序号。
    // 锚点：春分 N≈80 → 0，夏至 N≈172 → +ε，冬至 N≈355 → −ε；误差 ±1.5° 内，满足视觉光照用途。
    function solarDeclination(dayOfYear) {
        if (!Number.isFinite(dayOfYear))
            return 0;
        const n = ((Math.round(dayOfYear) - 1) % 365 + 365) % 365 + 1;
        return TimeCoreDomain.SOLAR_OBLIQUITY_DEG * Math.sin((360 * (n - 80) / 365) * Math.PI / 180);
    }
    TimeCoreDomain.solarDeclination = solarDeclination;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
