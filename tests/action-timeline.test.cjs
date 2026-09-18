const assert = require('node:assert/strict');

require('../js/generated/action-timeline.js');
const { createActionTimeline } = globalThis.TimeCoreDomain;

const timeline = createActionTimeline({ precise: true, preSpawnMs: 1800 });
const node = 20000;
const now = 1000;
const plan = timeline.plan(node, now, [
  { actionId: 'tap', deviceId: 'd1', offsetMs: 0, wakeMs: 1000 },
  { actionId: 'tap', deviceId: 'd2', offsetMs: 0, wakeMs: 0 },
  { actionId: 'wake', deviceId: 'd1', offsetMs: 2000, wakeMs: 500 }
]);

assert.equal(plan.nodeEpoch, node);
assert.equal(plan.entries.length, 3);
assert.equal(plan.skipped, 0);
assert.deepEqual(plan.entries.map(x => [x.actionId, x.deviceId]), [
  ['tap', 'd1'], ['tap', 'd2'], ['wake', 'd1']
]);
assert.deepEqual(plan.entries.map(x => [x.triggerEpoch, x.fireEpoch, x.spawnEpoch]), [
  [20000, 19000, 17200],
  [20000, 20000, 18200],
  [22000, 21500, 19700]
]);
assert.ok(plan.entries.every(x => Number.isInteger(x.triggerEpoch) && x.triggerEpoch >= node));

const soon = timeline.plan(4920, 4900, [
  { actionId: 'tap', deviceId: 'd1', offsetMs: 0, wakeMs: 0 },
  { actionId: 'wake', deviceId: 'd1', offsetMs: 1000, wakeMs: 0 }
]);
assert.equal(soon.skipped, 1);
assert.equal(soon.entries.length, 1);
assert.equal(soon.entries[0].spawnEpoch, 4940);

const simple = createActionTimeline({ precise: false, preSpawnMs: 1800 });
const simplePlan = simple.plan(10000, 1000, [
  { actionId: 'tap', deviceId: 'd1', offsetMs: 0, wakeMs: 500 }
]);
assert.equal(simplePlan.entries[0].fireEpoch, 9500);
assert.equal(simplePlan.entries[0].spawnEpoch, 9500);

const normalized = timeline.plan(30000, 1000, [
  { actionId: 'tap', deviceId: 'd1', offsetMs: -50, wakeMs: -10 },
  { actionId: 'bad', deviceId: 'd2', offsetMs: Number.NaN, wakeMs: Number.NaN }
]);
assert.equal(normalized.entries[0].triggerEpoch, 30000);
assert.equal(normalized.entries[0].fireEpoch, 30000);
assert.equal(normalized.entries[1].triggerEpoch, 30000);
assert.equal(normalized.entries[1].fireEpoch, 30000);

assert.equal(timeline.emissionKey('tap', 'd1', 20000), 'tap:d1:20000');
assert.notEqual(timeline.emissionKey('tap', 'd1', 20000), timeline.emissionKey('tap', 'd1', 25000));
assert.throws(() => timeline.plan(Number.NaN, now, []), /absolute epoch/i);

console.log('action-timeline contract: 18 assertions passed');
