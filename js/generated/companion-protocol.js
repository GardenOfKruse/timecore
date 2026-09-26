"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    // 局域网伴侣页协议（v1.30.0）：渲染端→主进程的命令路由 + 状态白名单投影。
    // 快照必须经 projectState 投影——ADB 配置、击拍统计等一切白名单外字段不出门。
    const STATE_FIELDS = [
        'armed', 'phase', 'remainingMs', 'target', 'periodMs', 'cycleIndex', 'cycles', 'infinite', 'fired', 'hasNext', 'epoch'
    ];
    const COMMANDS = new Set(['set-enabled', 'push-state']);
    function createCompanionProtocol() {
        function projectState(raw) {
            const out = {};
            if (!raw || typeof raw !== 'object')
                return out;
            const src = raw;
            for (const k of STATE_FIELDS) {
                if (src[k] !== undefined && src[k] !== null && (typeof src[k] !== 'object'))
                    out[k] = src[k];
            }
            return out;
        }
        function routeCommand(command, arg) {
            if (typeof command !== 'string' || !COMMANDS.has(command))
                return null;
            if (command === 'set-enabled')
                return { type: 'set-enabled', enabled: arg === true };
            if (typeof arg !== 'object' || arg === null)
                return null;
            return { type: 'push-state', state: projectState(arg) };
        }
        return { routeCommand, projectState };
    }
    TimeCoreDomain.createCompanionProtocol = createCompanionProtocol;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
