const assert = require('node:assert/strict');

require('../js/generated/adb-scan-coordinator.js');
const { createAdbScanCoordinator } = globalThis.TimeCoreDomain;

(async () => {

const devices = new Map([
  ['usb-1', { serial: 'usb-1', model: 'Model One' }],
  ['ip:5555', { serial: 'ip:5555', model: 'Model IP' }]
]);
const updates = [];
const reconciles = [];
const registry = {
  reconcile(stdout, nowEpoch) {
    reconciles.push([stdout, nowEpoch]);
    return {
      snapshot: { signature: stdout === 'same' ? 'sig-1' : 'sig-2', devices: [...devices.values()] },
      work: { nameSerials: ['usb-1', 'missing'], screenSizeSerials: ['ip:5555'], probeSerials: ['usb-1'] },
      seen: ['usb-1', 'ip:5555']
    };
  },
  get(serial) { return devices.get(serial) || null; },
  update(serial, patch) { updates.push([serial, patch]); return devices.get(serial) || null; }
};

let releaseName;
const nameReady = new Promise(resolve => { releaseName = resolve; });
const events = [];
const coordinator = createAdbScanCoordinator({
  registry,
  tasks: {
    resolveName(serial) {
      events.push(['name-start', serial]);
      return serial === 'usb-1' ? nameReady : Promise.resolve('missing');
    },
    measureScreenSize(serial, device) { events.push(['size', serial, device.model]); },
    probe(serial, device, silent) { events.push(['probe', serial, device.model, silent]); }
  }
});

const running = coordinator.run({ stdout: 'changed', nowEpoch: 1234, previousSignature: 'old', silent: true });
assert.deepEqual(events, [
  ['name-start', 'usb-1'],
  ['size', 'ip:5555', 'Model IP'],
  ['probe', 'usb-1', 'Model One', true]
]);
assert.deepEqual(reconciles, [['changed', 1234]]);
releaseName('工作机');
const result = await running;
assert.equal(result.changed, true);
assert.equal(result.nameCount, 2);
assert.equal(result.snapshot.signature, 'sig-2');
assert.deepEqual(result.seen, ['usb-1', 'ip:5555']);
assert.deepEqual(updates, [['usb-1', { name: '工作机' }]]);

const same = await coordinator.run({ stdout: 'same', nowEpoch: 2000, previousSignature: 'sig-1', silent: false });
assert.equal(same.changed, false);
assert.equal(same.nameCount, 2);
assert.equal(same.snapshot.signature, 'sig-1');
assert.deepEqual(same.seen, ['usb-1', 'ip:5555']);
assert.deepEqual(events.slice(-3), [
  ['name-start', 'usb-1'],
  ['size', 'ip:5555', 'Model IP'],
  ['probe', 'usb-1', 'Model One', false]
]);
assert.equal(reconciles.length, 2);

console.log('adb-scan-coordinator contract: 13 assertions passed');
})();
