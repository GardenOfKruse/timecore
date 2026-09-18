const assert = require('node:assert/strict');

require('../js/generated/action-timeline.js');
const createActionTimeline = globalThis.TimeCoreDomain.createActionTimeline;
require('../js/generated/adb-emission-gate.js');
const createAdbEmissionGate = globalThis.TimeCoreDomain.createAdbEmissionGate;
require('../js/generated/adb-schedule-coordinator.js');
const createAdbScheduleCoordinator = globalThis.TimeCoreDomain.createAdbScheduleCoordinator;

const queue = [];
const timer = {
  set(callback, delayMs) {
    const handle = { callback, delayMs, cancelled: false };
    queue.push(handle);
    return handle;
  },
  clear(handle) {
    handle.cancelled = true;
  }
};

const fired = [];
const coordinator = createAdbScheduleCoordinator({
  planner: createActionTimeline({ precise: true, preSpawnMs: 1800 }),
  gate: createAdbEmissionGate(),
  timer
});

const input = {
  nodeEpoch: 10000,
  nowEpoch: 1000,
  lanes: [
    { actionId: 'tap', deviceId: 'd1', offsetMs: 0, wakeMs: 0 },
    { actionId: 'tap', deviceId: 'd2', offsetMs: 2000, wakeMs: 0 }
  ],
  onFire: entry => fired.push(entry)
};

const first = coordinator.arm(input);
assert.deepEqual(first, { armed: true, planned: 2, pending: 2, spawned: 0 });
assert.deepEqual(queue.slice(0, 2).map(x => x.delayMs), [7200, 9200]);

queue[0].callback();
assert.equal(fired.length, 1);
assert.equal(fired[0].nodeEpoch, 10000);
assert.equal(coordinator.state().pending, 1);
assert.equal(coordinator.state().spawned, 1);

const oldCallback = queue[1].callback;
coordinator.arm(input); // 同节点重排：旧 timer 失效，已发射记录保留
assert.equal(queue[1].cancelled, true);
oldCallback();
assert.equal(fired.length, 1);
queue[2].callback();
assert.equal(fired.length, 1); // d1 的同节点计划再次被 gate 拦截
queue[3].callback();
assert.equal(fired.length, 2);
assert.equal(fired[1].deviceId, 'd2');

const next = coordinator.arm({ ...input, nodeEpoch: 20000 });
assert.deepEqual(next, { armed: true, planned: 2, pending: 2, spawned: 0 });
queue[4].callback();
assert.equal(fired.length, 3); // 新绝对节点允许同一动作再次发射

coordinator.clear();
assert.deepEqual(coordinator.state(), { armed: false, planned: 0, pending: 0, spawned: 1 });
coordinator.reset();
assert.deepEqual(coordinator.state(), { armed: false, planned: 0, pending: 0, spawned: 0 });

assert.throws(() => coordinator.arm({ ...input, nodeEpoch: Number.NaN }), /absolute epoch/i);
assert.throws(() => coordinator.arm({ ...input, nowEpoch: Number.NaN }), /absolute epoch/i);

console.log('adb-schedule-coordinator contract: 20 assertions passed');
