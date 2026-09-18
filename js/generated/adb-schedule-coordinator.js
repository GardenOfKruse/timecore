"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function assertEpoch(value, name) {
        if (!Number.isFinite(value))
            throw new RangeError(name + ' must be an absolute epoch value');
    }
    function browserTimer() {
        return {
            set: (callback, delayMs) => setTimeout(callback, Math.max(0, delayMs)),
            clear: handle => clearTimeout(handle)
        };
    }
    function createAdbScheduleCoordinator(options) {
        const timer = options.timer || browserTimer();
        const handles = new Set();
        let generation = 0;
        let planned = 0;
        let armed = false;
        function copyState() {
            return { armed, planned, pending: handles.size, spawned: options.gate.size() };
        }
        function clear() {
            generation++;
            for (const handle of handles)
                timer.clear(handle);
            handles.clear();
            armed = false;
            planned = 0;
        }
        function reset() {
            clear();
            options.gate.reset();
        }
        function arm(input) {
            assertEpoch(input.nodeEpoch, 'nodeEpoch');
            assertEpoch(input.nowEpoch, 'nowEpoch');
            clear();
            options.gate.arm(input.nodeEpoch);
            const plan = options.planner.plan(input.nodeEpoch, input.nowEpoch, input.lanes);
            const token = generation;
            for (const entry of plan.entries) {
                let handle;
                const callback = () => {
                    if (token !== generation)
                        return;
                    if (handles.has(handle))
                        handles.delete(handle);
                    if (options.gate.claim(entry.actionId, entry.deviceId, entry.nodeEpoch))
                        input.onFire(entry);
                };
                handle = timer.set(callback, Math.max(0, entry.spawnEpoch - input.nowEpoch));
                handles.add(handle);
            }
            planned = plan.entries.length;
            armed = planned > 0;
            return copyState();
        }
        return { arm, clear, reset, state: copyState };
    }
    TimeCoreDomain.createAdbScheduleCoordinator = createAdbScheduleCoordinator;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
