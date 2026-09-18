"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function finite(value) {
        return Number.isFinite(value);
    }
    function createAudioScheduleCoordinator(planner, options = {}) {
        const reanchorMs = options.reanchorMs == null ? 30000 : options.reanchorMs;
        const maxScheduled = options.maxScheduled == null ? 4000 : options.maxScheduled;
        const scheduled = new Set();
        let anchorValue = null;
        function anchor(epoch, audioTime) {
            if (!finite(epoch) || !finite(audioTime))
                throw new RangeError('audio anchor must be finite');
            anchorValue = { epoch, audioTime };
        }
        function reanchorIfDue(epoch, readAudioTime) {
            if (!anchorValue || epoch - anchorValue.epoch <= reanchorMs)
                return false;
            anchor(epoch, readAudioTime());
            return true;
        }
        function audioTimeFor(epoch) {
            if (!anchorValue)
                throw new Error('audio schedule is not anchored');
            return anchorValue.audioTime + (epoch - anchorValue.epoch) / 1000;
        }
        function accept(entry) {
            const scheduledEntry = { ...entry, audioTime: audioTimeFor(entry.epoch) };
            scheduled.add(entry.key);
            if (entry.fireKey)
                scheduled.add(entry.fireKey);
            return scheduledEntry;
        }
        function trim() {
            if (scheduled.size > maxScheduled)
                scheduled.clear();
        }
        function planCountdown(input) {
            const output = [];
            for (const entry of planner.planCountdown(input)) {
                if (scheduled.has(entry.key))
                    continue;
                output.push(accept(entry));
            }
            trim();
            return output;
        }
        function planFreeRun(nowEpoch) {
            const entry = planner.planFreeRun(nowEpoch);
            if (scheduled.has(entry.key))
                return null;
            const output = accept(entry);
            trim();
            return output;
        }
        return {
            anchor,
            reanchorIfDue,
            planCountdown,
            planFreeRun,
            clearScheduled: () => scheduled.clear(),
            hasFireKey: targetEpoch => scheduled.has('fire:' + targetEpoch),
            scheduledSize: () => scheduled.size
        };
    }
    TimeCoreDomain.createAudioScheduleCoordinator = createAudioScheduleCoordinator;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
