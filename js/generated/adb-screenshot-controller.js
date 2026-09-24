"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function field(result, key) {
        if (!result || typeof result !== 'object')
            return undefined;
        return result[key];
    }
    function isShot(action) {
        return typeof action._shot === 'string' && action._shot.length > 0;
    }
    function validCoordinate(value) {
        return value !== '' && Number.isFinite(Number(value));
    }
    function createAdbScreenshotController(options) {
        async function capture(action) {
            const device = options.targets.resolve(action);
            if (!device) {
                options.log('「' + action.name + '」没有在线设备，无法截屏选点');
                return false;
            }
            const result = await options.executor.exec(options.getAdbPath(), ['-s', device.serial, 'exec-out', 'screencap', '-p'], { timeoutMs: 15000, binary: true });
            const b64 = field(result, 'b64');
            if (!field(result, 'ok') || typeof b64 !== 'string' || b64.length < 100) {
                const reason = String(field(result, 'stderr') || field(result, 'error') || '').trim().slice(0, 60) || '图像为空';
                options.log('截屏失败：' + reason);
                return false;
            }
            action._shot = b64;
            action.shotW = device.W || 1080;
            action.shotH = device.H || 2340;
            if (!validCoordinate(action.x) || !validCoordinate(action.y)) {
                action.x = Math.round(action.shotW / 2);
                action.y = Math.round(action.shotH / 2);
            }
            if (options.shotStore) {
                try {
                    void options.shotStore.save(String(action.id), b64);
                }
                catch (_) { /* 存档失败不阻塞选点流程 */ }
            }
            options.render();
            options.log('已截取 ' + (device.name || device.serial) + ' 屏幕，点击截图选点');
            return true;
        }
        // 从磁盘存档恢复当时的截图（应用重启后内存 _shot 已失，但存档还在）
        async function restore(action) {
            if (!options.shotStore)
                return false;
            try {
                const r = await options.shotStore.load(String(action.id));
                if (r && r.ok === true && typeof r.b64 === 'string' && r.b64.length > 100) {
                    action._shot = r.b64;
                    return true;
                }
            }
            catch (_) { /* 读取失败静默降级为重新截屏 */ }
            return false;
        }
        async function open(action, openOptions = {}) {
            if (!isShot(action) && (await restore(action))) {
                if (openOptions.show !== false)
                    options.picker.open(action);
                return;
            }
            const shouldCapture = openOptions.capture === true || !isShot(action);
            if (shouldCapture && !(await capture(action)))
                return;
            if (openOptions.show !== false)
                options.picker.open(action);
        }
        function select(action, x, y) {
            action.x = x;
            action.y = y;
            options.save();
            options.log('「' + action.name + '」选点 → ' + action.x + ',' + action.y);
        }
        function retake(action) {
            return open(action, { capture: true, show: true });
        }
        function close() {
            options.render();
        }
        return { open, select, retake, close };
    }
    TimeCoreDomain.createAdbScreenshotController = createAdbScreenshotController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
