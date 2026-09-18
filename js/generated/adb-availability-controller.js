"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function text(value) {
        return value == null ? '' : String(value);
    }
    function isAncient(version) {
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
        return !!match && +match[1] === 1 && +match[2] === 0 && +match[3] < 41;
    }
    function failed(error) {
        return { ok: false, error: text(error) };
    }
    function createAdbAvailabilityController(options) {
        const initial = options.initial || {};
        let current = {
            ok: Boolean(initial.ok),
            path: text(initial.path),
            version: text(initial.version),
            ancient: initial.ancient == null ? isAncient(text(initial.version)) : Boolean(initial.ancient)
        };
        function state() {
            return { ...current };
        }
        async function detect(explicitPath) {
            if (!options.isSupported())
                return { ok: false };
            let response;
            try {
                response = await options.executor.detect(explicitPath);
            }
            catch (error) {
                response = failed(error);
            }
            current.ok = Boolean(response?.ok);
            if (current.ok) {
                current.path = text(response.path);
                current.version = text(response.version);
                current.ancient = isAncient(current.version);
                options.setPath(current.path);
                options.persist();
            }
            options.render();
            return response;
        }
        async function download() {
            if (!options.isSupported())
                return { ok: false };
            options.log('开始下载 adb（官方 platform-tools，约 6MB）…');
            let response;
            try {
                response = await options.executor.download();
            }
            catch (error) {
                response = failed(error);
            }
            if (!response?.ok) {
                options.log('下载失败：' + (text(response?.error) || '未知错误'));
                return response;
            }
            options.log('adb 下载完成，已自动放置');
            options.setPath('');
            options.persist();
            await detect();
            await options.scan();
            return response;
        }
        return { state, detect, download };
    }
    TimeCoreDomain.createAdbAvailabilityController = createAdbAvailabilityController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
