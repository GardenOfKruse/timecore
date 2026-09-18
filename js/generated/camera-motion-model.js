"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function copy(state) {
        return {
            yaw: state.yaw,
            targetYaw: state.targetYaw,
            pitch: state.pitch,
            targetPitch: state.targetPitch
        };
    }
    function finiteOr(value, fallback) {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }
    function createCameraMotionModel(options = {}) {
        const yawSensitivity = finiteOr(options.yawSensitivity, 0.009);
        const pitchSensitivity = finiteOr(options.pitchSensitivity, 0.007);
        const minPitch = finiteOr(options.minPitch, -1.15);
        const maxPitch = Math.max(minPitch, finiteOr(options.maxPitch, 1.15));
        const smoothing = Math.max(0, finiteOr(options.smoothing, 8));
        const stateValue = { yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0 };
        function clampPitch(value) {
            return Math.max(minPitch, Math.min(maxPitch, value));
        }
        function drag(deltaX, deltaY) {
            const dx = finiteOr(deltaX, 0);
            const dy = finiteOr(deltaY, 0);
            stateValue.targetYaw -= dx * yawSensitivity;
            stateValue.targetPitch = clampPitch(stateValue.targetPitch - dy * pitchSensitivity);
            return copy(stateValue);
        }
        function update(dt) {
            const elapsed = Math.max(0, finiteOr(dt, 0));
            const factor = 1 - Math.exp(-elapsed * smoothing);
            stateValue.yaw += (stateValue.targetYaw - stateValue.yaw) * factor;
            stateValue.pitch += (stateValue.targetPitch - stateValue.pitch) * factor;
            return copy(stateValue);
        }
        function reset() {
            stateValue.yaw = 0;
            stateValue.targetYaw = 0;
            stateValue.pitch = 0;
            stateValue.targetPitch = 0;
            return copy(stateValue);
        }
        return {
            drag,
            update,
            state: () => copy(stateValue),
            reset
        };
    }
    TimeCoreDomain.createCameraMotionModel = createCameraMotionModel;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
