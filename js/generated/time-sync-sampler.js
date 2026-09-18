"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function createTimeSyncSampler(platform, options = {}) {
        const timeoutMs = options.timeoutMs == null ? 2500 : options.timeoutMs;
        const maxRttMs = options.maxRttMs == null ? 1800 : options.maxRttMs;
        async function sample(source) {
            const controller = platform.createAbortController();
            const timeout = platform.setTimeout(() => controller.abort(), timeoutMs);
            const startedAt = platform.now();
            try {
                const response = await platform.fetch(source.url, { cache: 'no-store', signal: controller.signal });
                const responseAt = platform.now();
                const serverEpoch = source.parse(JSON.parse(await response.text()));
                if (!Number.isFinite(serverEpoch))
                    throw new Error('bad payload');
                const rtt = responseAt - startedAt;
                if (rtt > maxRttMs)
                    throw new Error('rtt too high');
                const localMid = platform.baselineEpoch + ((startedAt + responseAt) / 2 - platform.baselineMonotonicMs);
                return { offset: serverEpoch - localMid, rtt, src: source.name };
            }
            finally {
                platform.clearTimeout(timeout);
            }
        }
        async function sampleMany(sources, limit = 3) {
            const results = [];
            const count = Math.max(0, Math.floor(limit));
            for (const source of sources) {
                if (results.length >= count)
                    break;
                try {
                    results.push(await sample(source));
                }
                catch (_) { /* 单源失败不阻断多源校时 */ }
            }
            return results;
        }
        return { sample, sampleMany };
    }
    TimeCoreDomain.createTimeSyncSampler = createTimeSyncSampler;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
