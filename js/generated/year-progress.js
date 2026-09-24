"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    // 格里高利闰年规则：能被 4 整除且不被 100 整除，或能被 400 整除
    function isLeapYear(year) {
        if (!Number.isInteger(year) || year < 1)
            return false;
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }
    TimeCoreDomain.isLeapYear = isLeapYear;
    // month: 1-12, day: 1-31 → 1-based 天序号；非法入参返回 0
    function dayOfYear(year, month, day) {
        if (!Number.isInteger(year) || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31))
            return 0;
        const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        let doy = CUM[month - 1] + day;
        if (month > 2 && isLeapYear(year))
            doy += 1;
        return doy;
    }
    TimeCoreDomain.dayOfYear = dayOfYear;
    function yearProgress(year, doy, dayFrac) {
        const leap = isLeapYear(year);
        const days = leap ? 366 : 365;
        const d = Number.isFinite(doy) && doy >= 1 && doy <= days ? doy : 1;
        const df = Number.isFinite(dayFrac) ? Math.min(1, Math.max(0, dayFrac)) : 0;
        // 日环转一圈 = 年环走一格：frac 把当日已流逝比例纳入分母，年环与日环同速连续流动
        return { frac: Math.min(1, (d - 1 + df) / days), dayOfYear: d, leapYear: leap };
    }
    TimeCoreDomain.yearProgress = yearProgress;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
