"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    TimeCoreDomain.GAP_MIN_MS = 90000; // 90 秒内不算裂缝（正常切走再切回）
    // 挂起唤醒/隔夜重开检测：prev 为上次可见时刻的 epoch，now 为当前。
    // prev 非法或时间倒退（prev > now，系统时钟校准所致）一律判无裂缝。
    function evaluateGap(prevEpoch, nowEpoch, minGapMs) {
        const min = Number.isFinite(minGapMs) && minGapMs >= 0 ? minGapMs : TimeCoreDomain.GAP_MIN_MS;
        if (!Number.isFinite(prevEpoch) || prevEpoch <= 0)
            return { gapMs: 0, crossed: false };
        const gapMs = Math.floor(nowEpoch - prevEpoch);
        if (!Number.isFinite(gapMs) || gapMs <= 0)
            return { gapMs: 0, crossed: false };
        return { gapMs, crossed: gapMs > min };
    }
    TimeCoreDomain.evaluateGap = evaluateGap;
    // 裂缝时长的人读格式：2h13m / 5m / 42s
    function formatGap(gapMs) {
        if (!Number.isFinite(gapMs) || gapMs <= 0)
            return '';
        const totalSec = Math.floor(gapMs / 1000);
        if (totalSec < 60)
            return totalSec + 's';
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        if (h > 0)
            return h + 'h' + String(m).padStart(2, '0') + 'm';
        return m + 'm';
    }
    TimeCoreDomain.formatGap = formatGap;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
