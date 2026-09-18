"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const DEFAULT_PRESPAWN_MS = 1800;
    const DEFAULT_SKIP_WINDOW_MS = 30;
    const DEFAULT_MIN_SCHEDULE_DELAY_MS = 40;
    function nonNegative(value, fallback) {
        return value != null && Number.isFinite(value) ? Math.max(0, value) : fallback;
    }
    function compareText(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }
    function createActionTimeline(options = {}) {
        const precise = options.precise !== false;
        const preSpawnMs = nonNegative(options.preSpawnMs, DEFAULT_PRESPAWN_MS);
        const skipIfWithinMs = nonNegative(options.skipIfWithinMs, DEFAULT_SKIP_WINDOW_MS);
        const minScheduleDelayMs = nonNegative(options.minScheduleDelayMs, DEFAULT_MIN_SCHEDULE_DELAY_MS);
        function emissionKey(actionId, deviceId, nodeEpoch) {
            return String(actionId) + ':' + String(deviceId) + ':' + String(nodeEpoch);
        }
        function plan(nodeEpoch, nowEpoch, lanes) {
            if (!Number.isFinite(nodeEpoch) || !Number.isFinite(nowEpoch)) {
                throw new RangeError('nodeEpoch and nowEpoch must be absolute epoch values');
            }
            const entries = [];
            let skipped = 0;
            for (const lane of lanes) {
                if (!lane || !lane.actionId || !lane.deviceId) {
                    skipped++;
                    continue;
                }
                const offsetMs = nonNegative(lane.offsetMs, 0);
                const wakeMs = nonNegative(lane.wakeMs, 0);
                const triggerEpoch = nodeEpoch + offsetMs;
                const fireEpoch = triggerEpoch - wakeMs;
                if (fireEpoch <= nowEpoch + skipIfWithinMs) {
                    skipped++;
                    continue;
                }
                const earliest = nowEpoch + minScheduleDelayMs;
                const spawnEpoch = precise
                    ? Math.max(earliest, fireEpoch - preSpawnMs)
                    : Math.max(earliest, fireEpoch);
                entries.push({
                    key: emissionKey(lane.actionId, lane.deviceId, nodeEpoch),
                    actionId: lane.actionId,
                    deviceId: lane.deviceId,
                    nodeEpoch,
                    triggerEpoch,
                    fireEpoch,
                    spawnEpoch
                });
            }
            entries.sort((a, b) => a.spawnEpoch - b.spawnEpoch ||
                a.triggerEpoch - b.triggerEpoch ||
                compareText(a.actionId, b.actionId) ||
                compareText(a.deviceId, b.deviceId));
            return { nodeEpoch, nowEpoch, entries, skipped };
        }
        return { plan, emissionKey };
    }
    TimeCoreDomain.createActionTimeline = createActionTimeline;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
