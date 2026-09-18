"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function createAdbScanCoordinator(options) {
        const registry = options.registry;
        const tasks = options.tasks;
        async function run(input) {
            const result = registry.reconcile(input.stdout, input.nowEpoch);
            const nameJobs = result.work.nameSerials.map(async (serial) => {
                const device = registry.get(serial);
                if (!device)
                    return;
                const name = await tasks.resolveName(serial, device);
                const current = registry.get(serial) || device;
                registry.update(serial, { name: name || current.model || serial.slice(-4) });
            });
            result.work.screenSizeSerials.forEach(serial => {
                const device = registry.get(serial);
                if (device)
                    void tasks.measureScreenSize(serial, device);
            });
            result.work.probeSerials.forEach(serial => {
                const device = registry.get(serial);
                if (device)
                    void tasks.probe(serial, device, input.silent);
            });
            await Promise.all(nameJobs);
            return {
                ...result,
                changed: result.snapshot.signature !== input.previousSignature,
                nameCount: nameJobs.length
            };
        }
        return { run };
    }
    TimeCoreDomain.createAdbScanCoordinator = createAdbScanCoordinator;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
