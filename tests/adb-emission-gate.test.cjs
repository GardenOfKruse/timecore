const assert = require('node:assert/strict');

require('../js/generated/adb-emission-gate.js');
const { createAdbEmissionGate } = globalThis.TimeCoreDomain;

const gate = createAdbEmissionGate();
gate.arm(10000);
assert.equal(gate.size(), 0);
assert.equal(gate.claim('tap', 'usb-1', 10000), true);
assert.equal(gate.claim('tap', 'usb-1', 10000), false);
assert.equal(gate.claim('tap', 'usb-2', 10000), true);
assert.equal(gate.size(), 2);

gate.arm(10000); // 同节点重排：保留已发射记录
assert.equal(gate.claim('tap', 'usb-1', 10000), false);
assert.equal(gate.size(), 2);

gate.arm(20000); // 新绝对节点：旧节点记录全部作废
assert.equal(gate.size(), 0);
assert.equal(gate.claim('tap', 'usb-1', 20000), true);
gate.reset();
assert.equal(gate.size(), 0);
gate.arm(20000);
assert.equal(gate.claim('tap', 'usb-1', 20000), true);

assert.throws(() => gate.arm(Number.NaN), /absolute epoch/i);
assert.throws(() => gate.claim('tap', 'usb-1', Number.NaN), /absolute epoch/i);

console.log('adb-emission-gate contract: 13 assertions passed');
