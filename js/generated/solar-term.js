"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    /** 二十四节气，按太阳视黄经 15k°（k=0 春分）排序；小寒/大寒/立春/雨水/惊蛰发生在公历次年 1-2 月，由跨年扫描覆盖。 */
    TimeCoreDomain.SOLAR_TERMS = [
        '春分', '清明', '谷雨', '立夏', '小满', '芒种',
        '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
        '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
        '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰'
    ];
    const DAY_MS = 86400000;
    const J2000 = 2451545.0;
    function julianDay(epochMs) {
        return epochMs / DAY_MS + 2440587.5;
    }
    function epochFromJd(jd) {
        return Math.round((jd - 2440587.5) * DAY_MS);
    }
    /** 太阳视黄经（度，[0,360)）。Meeus 低阶：平黄经 + 中心差 + 光行差/章动修正，精度 ±0.01°（≈±15 分钟）。 */
    function solarApparentLongitude(jd) {
        const t = (jd - J2000) / 36525;
        const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
        const m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * Math.PI / 180;
        const c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m)
            + (0.019993 - 0.000101 * t) * Math.sin(2 * m)
            + 0.000289 * Math.sin(3 * m);
        const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * Math.PI / 180);
        return ((lambda % 360) + 360) % 360;
    }
    TimeCoreDomain.solarApparentLongitude = solarApparentLongitude;
    /** 求公历 year 年内发生的第 index 个节气（黄经 15·index°）的交节时刻。牛顿迭代至 0.1 秒内。 */
    function findSolarTermEpoch(year, index) {
        if (!Number.isFinite(year) || !Number.isFinite(index))
            return NaN;
        const y = Math.round(year);
        const k = ((Math.round(index) % 24) + 24) % 24;
        // 初值锚点：黄经 0°（春分）约在 3 月 20 日。小寒~惊蛰（k=19..23）发生在公历年初，
        // 起算锚点是上一年 3 月 20 日，否则迭代会收敛到下一个年周期。
        const baseYear = k >= 19 ? y - 1 : y;
        let jd = julianDay(Date.UTC(baseYear, 2, 20)) + k * 15.2184;
        const target = k * 15;
        for (let i = 0; i < 8; i++) {
            const lambda = solarApparentLongitude(jd);
            let diff = target - lambda;
            if (diff > 180)
                diff -= 360;
            if (diff < -180)
                diff += 360;
            if (Math.abs(diff * DAY_MS / 360) < 100)
                break;
            jd += diff / 0.9856;
        }
        return epochFromJd(jd);
    }
    TimeCoreDomain.findSolarTermEpoch = findSolarTermEpoch;
    /** 某公历年内的全部节气（含次年 1-2 月的早期节气按发生时刻归属），按时间升序。 */
    function solarTermsOfYear(year) {
        const y = Math.round(year);
        const all = [];
        for (const base of [y - 1, y, y + 1]) {
            for (let k = 0; k < 24; k++) {
                all.push({ index: k, name: TimeCoreDomain.SOLAR_TERMS[k], epoch: findSolarTermEpoch(base, k) });
            }
        }
        all.sort((a, b) => a.epoch - b.epoch);
        const yearStart = Date.UTC(y, 0, 1) - 8 * 3600000; // 以东八区年界归属（历法消费者）
        const yearEnd = Date.UTC(y + 1, 0, 1) - 8 * 3600000;
        return all.filter(term => term.epoch >= yearStart && term.epoch < yearEnd);
    }
    TimeCoreDomain.solarTermsOfYear = solarTermsOfYear;
    /** 当前节气与距下一节气的天数。 */
    function solarTermInfo(now) {
        if (!Number.isFinite(now))
            now = Date.now();
        const d = new Date(now);
        const year = d.getFullYear();
        const terms = solarTermsOfYear(year - 1)
            .concat(solarTermsOfYear(year), solarTermsOfYear(year + 1))
            .sort((a, b) => a.epoch - b.epoch);
        let cursor = terms[0];
        for (const term of terms) {
            if (term.epoch <= now)
                cursor = term;
            else
                break;
        }
        const follow = terms.find(term => term.epoch > now) || solarTermsOfYear(year + 2)[0];
        // 「距 X 日」按东八区日历日差（10/5 → 寒露 10/8 = 3 日），当天交节为 0
        const cstDay = (epoch) => Math.floor((epoch + 8 * 3600000) / DAY_MS);
        const daysToNext = Math.max(0, cstDay(follow.epoch) - cstDay(now));
        return {
            index: cursor.index,
            name: cursor.name,
            startEpoch: cursor.epoch,
            nextIndex: follow.index,
            nextName: follow.name,
            nextEpoch: follow.epoch,
            daysToNext
        };
    }
    TimeCoreDomain.solarTermInfo = solarTermInfo;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
