"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function assertFinite(value, name) {
        if (!Number.isFinite(value))
            throw new RangeError(name + ' must be an epoch value');
    }
    function planCountdown(input) {
        if (!input.armed || input.fired)
            return [];
        assertFinite(input.targetEpoch, 'targetEpoch');
        assertFinite(input.nowEpoch, 'nowEpoch');
        assertFinite(input.lookaheadMs, 'lookaheadMs');
        const kMin = Math.max(0, Math.ceil((input.targetEpoch - (input.nowEpoch + input.lookaheadMs)) / 1000));
        const kMax = Math.floor((input.targetEpoch - (input.nowEpoch - 40)) / 1000);
        const entries = [];
        for (let k = kMin; k <= kMax; k++) {
            const key = 'cd' + input.targetEpoch + ':' + k;
            const epoch = input.targetEpoch - k * 1000;
            if (k === 0) {
                entries.push({ key, kind: 'fire', epoch, beatIndex: 0, fireKey: 'fire:' + input.targetEpoch });
            }
            else if (k <= 3) {
                entries.push({ key, kind: 'beep', epoch, beatIndex: k });
            }
            else if (k <= input.softLead && input.tickOn) {
                entries.push({ key, kind: 'tick', epoch, beatIndex: k });
            }
            else if (input.tickOn && input.metroFull && input.freerun) {
                entries.push({ key, kind: 'tick', epoch, beatIndex: k });
            }
        }
        return entries;
    }
    function planFreeRun(nowEpoch, leadMs = 180) {
        assertFinite(nowEpoch, 'nowEpoch');
        assertFinite(leadMs, 'leadMs');
        const epoch = Math.ceil((nowEpoch + leadMs) / 1000) * 1000;
        return { key: 'fr' + epoch, kind: 'tick', epoch };
    }
    function createAudioSchedulePlanner() {
        return { planCountdown, planFreeRun };
    }
    TimeCoreDomain.createAudioSchedulePlanner = createAudioSchedulePlanner;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
