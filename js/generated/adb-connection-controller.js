"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function text(value) {
        return value == null ? '' : String(value);
    }
    function isWirelessEndpoint(value) {
        return /^\d+(\.\d+){3}:\d+$/.test(value);
    }
    function resultText(response) {
        const result = response;
        return text(result?.stdout || result?.stderr || result?.error).trim().slice(0, 60);
    }
    function createAdbConnectionController(options) {
        async function connect(ip) {
            const availability = options.availability();
            if (availability.ancient && isWirelessEndpoint(ip)) {
                options.log('⚠ adb ' + availability.version + ' 不支持 Android 11+ 无线调试（TLS 握手）——先点「⬇ 升级 adb」再连接');
            }
            const response = await options.executor.exec(availability.path, ['connect', ip], { timeoutMs: 8000 });
            options.log('connect ' + ip + ' → ' + resultText(response));
            await options.scan();
            const device = options.device(ip);
            if (device && device.state === 'offline') {
                options.log(availability.ancient
                    ? '⚠ ' + ip + ' 一直离线：旧版 adb 无法完成无线调试握手——「⬇ 升级 adb」装官方最新组件后重连即可'
                    : '⚠ ' + ip + ' 离线：请确认手机「无线调试」仍开启，必要时重新配对后重连');
            }
            else if (device && device.state === 'device') {
                options.log('✓ ' + ip + ' 已就绪（' + (text(device.name) || '设备') + '）');
            }
        }
        return { connect };
    }
    TimeCoreDomain.createAdbConnectionController = createAdbConnectionController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
