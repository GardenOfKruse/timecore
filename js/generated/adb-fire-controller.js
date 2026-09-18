"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function field(result, key) {
        if (!result || typeof result !== 'object')
            return undefined;
        return result[key];
    }
    function deviceName(device) {
        return device.name || device.serial;
    }
    function createAdbFireController(options) {
        function buildScript(request) {
            return options.scriptBuilder.build(request.action, request.device, { compensate: request.compensate });
        }
        async function runScript(request, script, tag) {
            const result = await options.executor.exec(request.adbPath, ['-s', request.device.serial, 'shell', script], { timeoutMs: 90000 });
            const ok = Boolean(field(result, 'ok'));
            const failure = String(field(result, 'stderr') || field(result, 'error') || '').trim().slice(0, 60)
                || ('exit ' + field(result, 'code'));
            options.logger.log(tag + ' ' + deviceName(request.device) + ' → ' + (ok
                ? '完成 ' + field(result, 'durMs') + 'ms'
                : '失败 ' + failure));
        }
        function dispatch(request) {
            const baseScript = buildScript(request);
            if (request.mode === 'test') {
                if (request.dry) {
                    options.logger.log('【演练】→ ' + deviceName(request.device) + '：' + baseScript.slice(0, 120));
                }
                else {
                    runScript(request, baseScript, request.tag || '试射');
                }
                return;
            }
            if (request.precise) {
                const fireEpoch = request.fireEpoch ?? options.clock.epoch();
                const halfLatency = request.calibrated && request.device.L != null ? request.device.L / 2 : 0;
                const sleepS = Math.max(0, (fireEpoch - (options.clock.epoch() + halfLatency)) / 1000);
                const script = (sleepS > 0.03 ? 'sleep ' + sleepS.toFixed(3) + '\n' : '') + baseScript;
                if (request.dry) {
                    options.logger.log('【演练·预发射】→ ' + deviceName(request.device) + ' sleep=' + sleepS.toFixed(3) + 's：' + baseScript.slice(0, 120));
                }
                else {
                    runScript(request, script, '⚡预');
                }
                return;
            }
            if (request.dry) {
                options.logger.log('【演练】→ ' + deviceName(request.device) + '：' + baseScript.slice(0, 120));
            }
            else {
                runScript(request, baseScript, '⚡');
            }
        }
        return { dispatch };
    }
    TimeCoreDomain.createAdbFireController = createAdbFireController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
