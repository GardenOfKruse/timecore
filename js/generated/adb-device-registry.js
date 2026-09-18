"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function cloneRecord(record) {
        return { ...record };
    }
    function cloneSaved(saved) {
        const output = {};
        for (const [serial, value] of Object.entries(saved))
            output[serial] = { ...value };
        return output;
    }
    function parseLine(line) {
        const match = line.match(/^(\S+)\s+(device|offline|unauthorized)/);
        if (!match)
            return null;
        const model = (line.match(/model:(\S+)/) || [])[1];
        return { serial: match[1], state: match[2], model };
    }
    function signature(devices) {
        return [...devices.values()]
            .map(d => [d.serial, d.state, d.on, d.name, d.L, d.W, d.H].join(':'))
            .join('|');
    }
    function createAdbDeviceRegistry(options = {}) {
        const devices = new Map();
        const saved = cloneSaved(options.saved || {});
        const staleAfterMs = options.staleAfterMs == null ? 60000 : Math.max(0, options.staleAfterMs);
        function savedFor(serial) {
            if (!saved[serial])
                saved[serial] = {};
            return saved[serial];
        }
        function snapshot() {
            return {
                devices: [...devices.values()].map(cloneRecord),
                saved: cloneSaved(saved),
                signature: signature(devices)
            };
        }
        function reconcile(stdout, nowEpoch) {
            if (!Number.isFinite(nowEpoch))
                throw new RangeError('nowEpoch must be an absolute epoch value');
            const seen = new Set();
            const nameSerials = [];
            const screenSizeSerials = [];
            const probeSerials = [];
            const nameSet = new Set();
            const screenSet = new Set();
            const probeSet = new Set();
            for (const line of String(stdout || '').split('\n')) {
                const parsed = parseLine(line);
                if (!parsed)
                    continue;
                seen.add(parsed.serial);
                const record = devices.get(parsed.serial) || { serial: parsed.serial };
                record.state = parsed.state;
                if (parsed.model)
                    record.model = parsed.model;
                const preference = savedFor(parsed.serial);
                if (preference.name)
                    record.name = preference.name;
                else if (!nameSet.has(parsed.serial)) {
                    nameSet.add(parsed.serial);
                    nameSerials.push(parsed.serial);
                }
                record.on = preference.on != null ? preference.on : true;
                preference.on = record.on;
                devices.set(parsed.serial, record);
                if (parsed.state === 'device') {
                    if (!record.W && !screenSet.has(parsed.serial)) {
                        screenSet.add(parsed.serial);
                        screenSizeSerials.push(parsed.serial);
                    }
                    const stale = record.L == null || !record.probedAt || nowEpoch - record.probedAt > staleAfterMs;
                    if (stale && !probeSet.has(parsed.serial)) {
                        probeSet.add(parsed.serial);
                        probeSerials.push(parsed.serial);
                    }
                }
            }
            for (const [serial, record] of devices) {
                if (!seen.has(serial) && !record.test)
                    devices.delete(serial);
            }
            const next = snapshot();
            return {
                snapshot: next,
                work: { nameSerials, screenSizeSerials, probeSerials },
                seen: [...seen]
            };
        }
        function update(serial, patch) {
            const record = devices.get(serial);
            if (!record) {
                const preference = savedFor(serial);
                if (patch.name !== undefined)
                    preference.name = patch.name;
                if (patch.on !== undefined)
                    preference.on = patch.on;
                return null;
            }
            Object.assign(record, patch);
            const preference = savedFor(serial);
            if (patch.name !== undefined)
                preference.name = record.name;
            if (patch.on !== undefined)
                preference.on = record.on;
            return cloneRecord(record);
        }
        function upsert(record) {
            if (!record || !record.serial)
                throw new TypeError('device serial is required');
            const current = devices.get(record.serial) || { serial: record.serial };
            Object.assign(current, record);
            const preference = savedFor(record.serial);
            if (current.name)
                preference.name = current.name;
            if (current.on != null)
                preference.on = current.on;
            devices.set(record.serial, current);
            return cloneRecord(current);
        }
        function remove(serial) {
            const existed = devices.delete(serial);
            delete saved[serial];
            return existed;
        }
        return {
            reconcile,
            update,
            upsert,
            remove,
            get: serial => {
                const record = devices.get(serial);
                return record ? cloneRecord(record) : null;
            },
            snapshot
        };
    }
    TimeCoreDomain.createAdbDeviceRegistry = createAdbDeviceRegistry;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
