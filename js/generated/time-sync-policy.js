"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function finite(value) {
        return Number.isFinite(value);
    }
    function createTimeSyncPolicy(options = {}) {
        const singleSourceMaxRttMs = options.singleSourceMaxRttMs == null ? 350 : options.singleSourceMaxRttMs;
        const disagreementMs = options.disagreementMs == null ? 400 : options.disagreementMs;
        const disagreementRttMs = options.disagreementRttMs == null ? 400 : options.disagreementRttMs;
        const freshWindowMs = options.freshWindowMs == null ? 30 * 60000 : options.freshWindowMs;
        const syncedRetryMs = options.syncedRetryMs == null ? 5 * 60000 : options.syncedRetryMs;
        const fallbackRetryMs = options.fallbackRetryMs == null ? 60 * 1000 : options.fallbackRetryMs;
        function decide(samples, nowEpoch, lastSyncEpoch) {
            const valid = samples.filter(sample => finite(sample.offset) && finite(sample.rtt));
            const ordered = valid.slice().sort((a, b) => a.rtt - b.rtt);
            let chosen = null;
            if (ordered.length >= 2) {
                chosen = ordered[0];
                if (Math.abs(ordered[0].offset - ordered[1].offset) > disagreementMs && ordered[0].rtt > disagreementRttMs) {
                    chosen = null;
                }
            }
            else if (ordered.length === 1 && ordered[0].rtt < singleSourceMaxRttMs) {
                chosen = ordered[0];
            }
            if (chosen) {
                return {
                    status: 'synced',
                    chosen,
                    targetOffset: Math.round(chosen.offset),
                    retryDelayMs: syncedRetryMs
                };
            }
            if (lastSyncEpoch && nowEpoch - lastSyncEpoch < freshWindowMs) {
                return { status: 'stale', chosen: null, targetOffset: null, retryDelayMs: fallbackRetryMs };
            }
            return { status: 'failed', chosen: null, targetOffset: 0, retryDelayMs: fallbackRetryMs };
        }
        return { decide };
    }
    TimeCoreDomain.createTimeSyncPolicy = createTimeSyncPolicy;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
