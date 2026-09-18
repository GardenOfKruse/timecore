"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    function cloneAction(action) {
        return { ...action, devs: action.devs.slice() };
    }
    function normalizeType(type) {
        return type === 'tap' || type === 'wake' || type === 'adv' ? type : 'adv';
    }
    function normalizeAction(value, idFactory) {
        if (!isRecord(value))
            return null;
        const rawType = typeof value.type === 'string' ? value.type : 'adv';
        const action = {
            ...value,
            id: typeof value.id === 'string' && value.id ? value.id : idFactory('load'),
            type: rawType,
            devs: Array.isArray(value.devs) ? value.devs.filter((serial) => typeof serial === 'string') : []
        };
        // 清理旧版测试动作，避免它重新出现在用户动作列表中。
        if (action.type === 'adv' && typeof action.script === 'string' && /getprop\s+ro\.product\.model/.test(action.script))
            return null;
        return action;
    }
    function normalizeActions(raw, idFactory) {
        const source = Array.isArray(raw) ? raw : [];
        return source.map(value => normalizeAction(value, idFactory)).filter((action) => !!action);
    }
    function defaultIdFactory(kind) {
        return 'a' + Date.now() + '-' + kind + '-' + Math.floor(Math.random() * 1000);
    }
    function createAdbActionCatalog(raw = [], options = {}) {
        const idFactory = options.idFactory || defaultIdFactory;
        let actions = normalizeActions(raw, idFactory);
        function list() { return actions; }
        function enabled() { return actions.filter(action => !!action.on); }
        function replace(next) {
            actions = normalizeActions(next, idFactory);
            return actions;
        }
        function create(type) {
            const base = {
                id: idFactory('action'),
                name: '',
                lead: '',
                devs: [],
                on: true,
                type: normalizeType(type)
            };
            if (base.type === 'tap')
                Object.assign(base, { name: '连点', x: '', y: '', n: 5, gap: 400 });
            else if (base.type === 'wake')
                Object.assign(base, { name: '亮屏连点', x: '', y: '', n: 3, gap: 500 });
            else
                Object.assign(base, { name: '自定义脚本', script: 'input tap {X} {Y}' });
            return base;
        }
        function add(type) {
            const action = create(type);
            actions.push(action);
            return action;
        }
        function createSeed() {
            return {
                id: idFactory('seed'),
                type: 'tap',
                name: '连点示例 · 右下 (864,2280)',
                x: 864,
                y: 2280,
                n: 5,
                gap: 400,
                lead: '',
                devs: [],
                on: false
            };
        }
        function resetToSeed() {
            actions = [createSeed()];
            return actions;
        }
        function seed() {
            const action = createSeed();
            actions.push(action);
            return action;
        }
        function remove(actionOrId) {
            const index = actions.findIndex(action => typeof actionOrId === 'string' ? action.id === actionOrId : action === actionOrId);
            if (index < 0)
                return false;
            actions.splice(index, 1);
            return true;
        }
        function removeDevice(serial) {
            let changed = false;
            for (const action of actions) {
                const next = action.devs.filter(deviceSerial => deviceSerial !== serial);
                if (next.length !== action.devs.length) {
                    action.devs = next;
                    changed = true;
                }
            }
            return changed;
        }
        function serialize() {
            return actions.map(action => {
                const snapshot = cloneAction(action);
                delete snapshot._shot;
                return snapshot;
            });
        }
        return { list, enabled, replace, add, seed, resetToSeed, remove, removeDevice, serialize };
    }
    TimeCoreDomain.createAdbActionCatalog = createAdbActionCatalog;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
