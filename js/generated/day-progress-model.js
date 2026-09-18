"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    // 输入为本地时区的「小时浮点数」（0..24，与 scene3d sunHour 同源）；输出夹取到 [0,1]
    function dayProgress(hourFloat) {
        const h = Number.isFinite(hourFloat) ? hourFloat : 0;
        const frac = Math.min(1, Math.max(0, h / 24));
        return { frac, hourFloat: h };
    }
    TimeCoreDomain.dayProgress = dayProgress;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
