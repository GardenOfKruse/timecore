"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    TimeCoreDomain.MOON_SYNODIC_DAYS = 29.530588853;
    // 参考新月：2000-01-06T18:14:00Z
    TimeCoreDomain.MOON_REFERENCE_NEW_MOON_MS = 947182440000;
    function moonPhase(epochMs) {
        const days = (epochMs - TimeCoreDomain.MOON_REFERENCE_NEW_MOON_MS) / 86400000;
        const phase = (((days / TimeCoreDomain.MOON_SYNODIC_DAYS) % 1) + 1) % 1;
        return {
            ageDays: phase * TimeCoreDomain.MOON_SYNODIC_DAYS,
            phase,
            angleRad: phase * Math.PI * 2,
            waxing: phase < 0.5
        };
    }
    TimeCoreDomain.moonPhase = moonPhase;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
