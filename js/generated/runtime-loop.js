"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function idleProgress(epoch) {
        return ((epoch / 1000) % 60) / 60;
    }
    function createRuntimeLoop(platform, ports) {
        let running = false;
        let refreshTimer = null;
        let watchdogTimer = null;
        let frameHandle = null;
        let lastFrameAt = null;
        let pulse = 0;
        let lastSecLeft = -1;
        function observe(info) {
            if (info.armed && !info.fired) {
                const secLeft = Math.ceil(info.remainingMs / 1000);
                if (secLeft !== lastSecLeft) {
                    lastSecLeft = secLeft;
                    pulse = Math.max(pulse, 0.5);
                }
            }
            else {
                lastSecLeft = -1;
            }
        }
        function refresh(epoch) {
            const info = ports.logical(epoch);
            observe(info);
            return info;
        }
        function frame() {
            if (!running)
                return;
            frameHandle = platform.requestFrame(frame);
            const now = platform.now();
            const dt = Math.min(0.05, (now - (lastFrameAt || now)) / 1000);
            lastFrameAt = now;
            const epoch = platform.epoch();
            const info = refresh(epoch);
            const progress = (info.armed || info.fired) ? info.progress : idleProgress(epoch);
            ports.renderScene(dt, {
                epoch,
                phase: info.phase,
                progress,
                pulse,
                armed: info.armed
            });
            pulse *= Math.exp(-dt * 5);
        }
        function prime(timestamp) {
            if (!running)
                return;
            lastFrameAt = timestamp;
            frameHandle = platform.requestFrame(frame);
        }
        function start() {
            if (running)
                return;
            running = true;
            refreshTimer = platform.setInterval(() => refresh(platform.epoch()), 66);
            watchdogTimer = platform.setInterval(() => ports.watchdog(), 120);
            frameHandle = platform.requestFrame(prime);
        }
        function stop() {
            if (!running)
                return;
            running = false;
            if (refreshTimer !== null)
                platform.clearInterval(refreshTimer);
            if (watchdogTimer !== null)
                platform.clearInterval(watchdogTimer);
            if (frameHandle !== null)
                platform.cancelFrame(frameHandle);
            refreshTimer = null;
            watchdogTimer = null;
            frameHandle = null;
            lastFrameAt = null;
            pulse = 0;
            lastSecLeft = -1;
        }
        return { start, stop };
    }
    TimeCoreDomain.createRuntimeLoop = createRuntimeLoop;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
