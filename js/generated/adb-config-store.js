"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function runtimeStorage() {
        const scope = globalThis;
        if (!scope.localStorage)
            throw new Error('AdbConfigStore requires localStorage');
        return scope.localStorage;
    }
    function cloneDefaults(defaults) {
        return JSON.parse(JSON.stringify(defaults));
    }
    function parsedObject(raw) {
        if (!raw)
            return {};
        try {
            const value = JSON.parse(raw);
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }
        catch (_) {
            return {};
        }
    }
    function createAdbConfigStore(options = {}) {
        const storage = options.storage || runtimeStorage();
        const key = options.key || 'tc.adb.v1';
        const defaults = options.defaults || {};
        function load() {
            return Object.assign(cloneDefaults(defaults), parsedObject(storage.getItem(key)));
        }
        function save(config, actionSnapshot) {
            const payload = Object.assign({}, config, { actions: actionSnapshot });
            storage.setItem(key, JSON.stringify(payload, (name, value) => name === '_shot' ? undefined : value));
        }
        return { load, save };
    }
    TimeCoreDomain.createAdbConfigStore = createAdbConfigStore;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
