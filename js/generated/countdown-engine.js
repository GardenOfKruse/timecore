"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    TimeCoreDomain.HOLD_MS = 1800;
    const IDLE_STATE = {
        armed: false,
        mode: 'single',
        phase: 'IDLE',
        target: 0,
        lastTarget: 0,
        remainingMs: 0,
        progress: 0,
        cycleIndex: 0,
        cycles: 1,
        infinite: false,
        aligned: false,
        periodMs: 0,
        fired: false,
        hasNext: false,
        totalMs: 1,
        startEpoch: 0
    };
    function localMidnightEpoch(epoch) {
        const date = new Date(epoch);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }
    function nextAlignedNode(periodMs, epoch, midnightEpoch = localMidnightEpoch) {
        const midnight = midnightEpoch(epoch);
        const passed = epoch - midnight;
        return midnight + (Math.floor(passed / periodMs) + 1) * periodMs;
    }
    TimeCoreDomain.nextAlignedNode = nextAlignedNode;
    function phaseFor(remainingMs) {
        if (remainingMs > 10000)
            return 'NORMAL';
        if (remainingMs > 5000)
            return 'WARMUP';
        if (remainingMs > 3000)
            return 'SURGE';
        return 'PULSE';
    }
    function createCountdownEngine(options = {}) {
        const midnightEpoch = options.midnightEpoch || localMidnightEpoch;
        const holdMs = options.holdMs == null ? TimeCoreDomain.HOLD_MS : options.holdMs;
        const state = { ...IDLE_STATE };
        let holdUntil = 0;
        function snapshot() {
            return { ...state };
        }
        function startSingle(targetEpoch, nowEpoch) {
            if (!Number.isFinite(targetEpoch) || targetEpoch <= nowEpoch)
                return [];
            Object.assign(state, {
                armed: true,
                mode: 'single',
                target: targetEpoch,
                lastTarget: targetEpoch,
                startEpoch: nowEpoch,
                totalMs: Math.max(1, targetEpoch - nowEpoch),
                cycles: 1,
                cycleIndex: 1,
                infinite: false,
                phase: 'NORMAL',
                aligned: false,
                periodMs: 0,
                fired: false,
                hasNext: false,
                remainingMs: 0,
                progress: 0
            });
            return [{ type: 'start', snapshot: snapshot() }];
        }
        function startAligned(periodMs, cycles, infinite, nowEpoch) {
            if (!Number.isFinite(periodMs) || periodMs < 1000)
                return [];
            const first = nextAlignedNode(periodMs, nowEpoch, midnightEpoch);
            const cycleCount = Math.max(1, cycles | 0);
            Object.assign(state, {
                armed: true,
                mode: infinite || cycleCount > 1 ? 'cycles' : 'single',
                target: first,
                lastTarget: first,
                startEpoch: nowEpoch,
                totalMs: periodMs,
                periodMs,
                cycles: cycleCount,
                cycleIndex: 1,
                infinite: !!infinite,
                aligned: true,
                phase: 'NORMAL',
                fired: false,
                hasNext: !!infinite || cycleCount > 1,
                remainingMs: 0,
                progress: 0
            });
            return [{ type: 'start', snapshot: snapshot() }];
        }
        function stop() {
            const wasArmed = state.armed;
            Object.assign(state, {
                armed: false,
                fired: false,
                phase: 'IDLE',
                remainingMs: 0,
                progress: 0
            });
            const events = [];
            if (wasArmed)
                events.push({ type: 'stop' });
            events.push({ type: 'phase', phase: 'IDLE' });
            return events;
        }
        function fire(nowEpoch) {
            state.fired = true;
            state.phase = 'ZERO';
            state.lastTarget = state.target;
            state.remainingMs = 0;
            state.progress = 1;
            state.hasNext = state.mode === 'cycles' && (state.infinite || state.cycleIndex < state.cycles);
            holdUntil = nowEpoch + holdMs;
            return [{ type: 'zero', target: state.target, hasNext: state.hasNext, cycleIndex: state.cycleIndex }];
        }
        function advance(nowEpoch) {
            state.cycleIndex++;
            state.target += state.totalMs;
            state.startEpoch = nowEpoch;
            state.totalMs = state.periodMs;
            state.fired = false;
            state.phase = 'NORMAL';
            state.remainingMs = 0;
            state.progress = 0;
            state.hasNext = state.infinite || state.cycleIndex < state.cycles;
            return [{ type: 'advance', cycleIndex: state.cycleIndex }];
        }
        function update(nowEpoch) {
            if (!state.armed) {
                if (state.phase !== 'IDLE') {
                    state.phase = 'IDLE';
                    return [{ type: 'phase', phase: 'IDLE' }];
                }
                return [];
            }
            if (state.fired) {
                if (nowEpoch < holdUntil)
                    return [];
                if (state.hasNext)
                    return advance(nowEpoch);
                state.armed = false;
                state.phase = 'IDLE';
                state.progress = 0;
                return [{ type: 'done' }, { type: 'phase', phase: 'IDLE' }];
            }
            const remainingMs = state.target - nowEpoch;
            if (remainingMs <= 0)
                return fire(nowEpoch);
            state.remainingMs = remainingMs;
            state.progress = Math.min(1, Math.max(0, 1 - remainingMs / state.totalMs));
            const phase = phaseFor(remainingMs);
            if (phase !== state.phase) {
                state.phase = phase;
                return [{ type: 'phase', phase }];
            }
            return [];
        }
        return { startSingle, startAligned, stop, update, snapshot };
    }
    TimeCoreDomain.createCountdownEngine = createCountdownEngine;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
