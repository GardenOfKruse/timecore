"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function detect(transport, explicitPath) {
        return transport.adb('detect', { path: explicitPath != null ? explicitPath : '' });
    }
    function exec(transport, path, args, options) {
        const payload = {
            path: path || 'adb',
            args: Array.isArray(args) ? [...args] : []
        };
        if (options && options.timeoutMs !== undefined)
            payload.timeoutMs = options.timeoutMs;
        if (options && options.binary)
            payload.binary = true;
        return transport.adb('exec', payload);
    }
    function download(transport) {
        return transport.adb('download', {});
    }
    function createAdbExecutor(transport) {
        return {
            detect: explicitPath => detect(transport, explicitPath),
            exec: (path, args, options) => exec(transport, path, args, options),
            download: () => download(transport)
        };
    }
    TimeCoreDomain.createAdbExecutor = createAdbExecutor;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
