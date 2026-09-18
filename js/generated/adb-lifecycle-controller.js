"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function createAdbLifecycleController(options) {
        let current = Boolean(options.initialEnabled);
        let generation = 0;
        function state() {
            return { enabled: current };
        }
        function isCurrent(token) {
            return token === generation && current;
        }
        async function activate(token) {
            try {
                await options.detect();
                if (!isCurrent(token) || !options.isAvailable())
                    return;
                if (options.hasDevices())
                    await options.scan();
                if (!isCurrent(token))
                    return;
                const info = options.countdown();
                if (info.armed && Number.isFinite(info.target))
                    options.arm(info.target);
            }
            catch (_) {
                // Detection and scanning adapters own their user-facing errors. A stale or failed
                // activation must not turn a toggle event into an unhandled rejection.
            }
        }
        async function setEnabled(enabled) {
            current = Boolean(enabled);
            const token = ++generation;
            options.setConfigEnabled(current);
            options.persist();
            if (!current)
                options.halt();
            options.render();
            options.log(current ? 'ADB 齐射已启用' : 'ADB 齐射已停用（不扫描、不发射）');
            if (current && options.isSupported())
                await activate(token);
            return state();
        }
        return { state, setEnabled };
    }
    TimeCoreDomain.createAdbLifecycleController = createAdbLifecycleController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
