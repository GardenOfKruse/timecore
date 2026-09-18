"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function text(value) {
        return value == null ? '' : String(value);
    }
    function createAdbScanController(options) {
        let previousSignature = '';
        async function scan(silent = false) {
            if (!options.isAvailable()) {
                return { status: 'skipped', changed: false, nameCount: 0, seenCount: 0 };
            }
            let response;
            try {
                response = await options.executor.exec(options.getPath(), ['devices', '-l'], { timeoutMs: 8000 });
            }
            catch (error) {
                response = { ok: false, error };
            }
            if (!response || !response.ok) {
                const error = text(response?.stderr || response?.error).slice(0, 80);
                options.onLog('扫描失败：' + error);
                return { status: 'failed', changed: false, nameCount: 0, seenCount: 0, error };
            }
            const result = await options.coordinator.run({
                stdout: text(response.stdout),
                nowEpoch: options.nowEpoch(),
                previousSignature,
                silent: !!silent
            });
            if (result.changed) {
                previousSignature = result.snapshot.signature;
                options.onChanged(result);
            }
            if (result.changed || result.nameCount)
                options.onPersist();
            options.onGuide();
            if (!silent || result.changed)
                options.onLog('扫描完成：' + result.seen.length + ' 台设备');
            return {
                status: 'completed',
                changed: result.changed,
                nameCount: result.nameCount,
                seenCount: result.seen.length
            };
        }
        return {
            scan,
            invalidate() { previousSignature = ''; }
        };
    }
    TimeCoreDomain.createAdbScanController = createAdbScanController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
