const assert = require('node:assert/strict');

require('../js/generated/adb-device-registry.js');
const { createAdbDeviceRegistry } = globalThis.TimeCoreDomain;

const registry = createAdbDeviceRegistry({
  saved: { 'offline-1': { name: '保留手机', on: false } }
});

const first = registry.reconcile([
  'List of devices attached',
  'usb-1 device product:foo model:Pixel_8 transport_id:1',
  'ip:5555 unauthorized'
].join('\n'), 100000);
assert.deepEqual(first.seen, ['usb-1', 'ip:5555']);
assert.deepEqual(first.work.nameSerials, ['usb-1', 'ip:5555']);
assert.deepEqual(first.work.screenSizeSerials, ['usb-1']);
assert.deepEqual(first.work.probeSerials, ['usb-1']);
assert.equal(first.snapshot.devices.length, 2);
assert.equal(first.snapshot.devices[0].model, 'Pixel_8');
assert.equal(first.snapshot.devices[0].on, true);
assert.equal(first.snapshot.devices[1].state, 'unauthorized');
assert.deepEqual(first.snapshot.saved['offline-1'], { name: '保留手机', on: false });

registry.update('usb-1', { name: '工作机', W: 1080, H: 2400, L: 42, probedAt: 100000 });
const stable = registry.reconcile('usb-1 device model:Pixel_8\nip:5555 device', 120000);
assert.deepEqual(stable.work.nameSerials, ['ip:5555']);
assert.deepEqual(stable.work.screenSizeSerials, ['ip:5555']);
assert.deepEqual(stable.work.probeSerials, ['ip:5555']);
assert.equal(stable.snapshot.devices.find(d => d.serial === 'usb-1').name, '工作机');
assert.equal(stable.snapshot.devices.find(d => d.serial === 'usb-1').L, 42);

const stale = registry.reconcile('usb-1 device\nip:5555 device', 161000);
assert.deepEqual(stale.work.probeSerials, ['usb-1', 'ip:5555']);
assert.ok(stale.snapshot.signature.includes('usb-1:device:true:工作机'));

registry.upsert({ serial: 'test-1', state: 'device', test: true, on: true, name: '模拟机' });
const missing = registry.reconcile('usb-1 offline', 170000);
assert.equal(missing.snapshot.devices.some(d => d.serial === 'test-1'), true);
assert.equal(missing.snapshot.devices.some(d => d.serial === 'ip:5555'), false);
assert.equal(registry.get('usb-1').state, 'offline');

assert.equal(registry.remove('test-1'), true);
assert.equal(registry.get('test-1'), null);
assert.equal(registry.remove('not-found'), false);
assert.throws(() => registry.reconcile('', Number.NaN), /absolute epoch/i);
assert.throws(() => registry.upsert({ serial: '' }), /serial/i);

console.log('adb-device-registry contract: 22 assertions passed');
