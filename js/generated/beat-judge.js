"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const COLORS = {
        PERFECT: '#8ef7ff',
        GREAT: '#7dff9b',
        GOOD: '#ffd76a',
        MISS: '#ff5d7a'
    };
    function assertFinite(value, name) {
        if (!Number.isFinite(value))
            throw new RangeError(name + ' must be an epoch value');
    }
    function createBeatJudge() {
        let combo = 0;
        let maxCombo = 0;
        let total = 0;
        const counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
        let last = null;
        function labelFor(deviationMs) {
            const absolute = Math.abs(deviationMs);
            if (absolute <= 60)
                return 'PERFECT';
            if (absolute <= 140)
                return 'GREAT';
            if (absolute <= 300)
                return 'GOOD';
            return 'MISS';
        }
        function judge(input) {
            assertFinite(input.at, 'at');
            assertFinite(input.nodeEpoch, 'nodeEpoch');
            const deviation = input.forcedDeviation != null ? input.forcedDeviation : input.at - input.nodeEpoch;
            assertFinite(deviation, 'deviation');
            const label = labelFor(deviation);
            total++;
            counts[label]++;
            if (label === 'MISS')
                combo = 0;
            else {
                combo++;
                maxCombo = Math.max(maxCombo, combo);
            }
            const acc = total ? (counts.PERFECT + counts.GREAT) / total : 0;
            const record = {
                label,
                color: COLORS[label],
                dev: Math.round(deviation),
                combo,
                maxCombo,
                acc,
                mode: input.mode,
                at: input.at
            };
            last = record;
            return record;
        }
        function stats() {
            return {
                combo,
                maxCombo,
                total,
                counts: { ...counts },
                last: last ? { ...last } : null
            };
        }
        return { colors: COLORS, labelFor, judge, stats };
    }
    TimeCoreDomain.createBeatJudge = createBeatJudge;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
