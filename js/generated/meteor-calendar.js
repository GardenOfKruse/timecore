"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    /** 三大知名流星雨峰值窗口（固定日期近似，东八区日界）：象限仪座、英仙座、双子座。 */
    TimeCoreDomain.METEOR_SHOWERS = [
        { name: '象限仪座流星雨', mm: 1, d1: 3, d2: 4 },
        { name: '英仙座流星雨', mm: 8, d1: 12, d2: 13 },
        { name: '双子座流星雨', mm: 12, d1: 13, d2: 14 }
    ];
    /** 当晚（按东八区日界归属）是否流星雨峰值夜；是则返回该流星雨，否则 null。 */
    function meteorShowerTonight(now) {
        if (!Number.isFinite(now))
            return null;
        const d = new Date(now + 8 * 3600000);
        const m = d.getUTCMonth() + 1;
        const day = d.getUTCDate();
        for (const shower of TimeCoreDomain.METEOR_SHOWERS) {
            if (shower.mm === m && day >= shower.d1 && day <= shower.d2)
                return shower;
        }
        return null;
    }
    TimeCoreDomain.meteorShowerTonight = meteorShowerTonight;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
