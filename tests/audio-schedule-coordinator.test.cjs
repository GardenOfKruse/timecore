const assert = require('node:assert/strict');

require('../js/generated/audio-schedule-coordinator.js');
const { createAudioScheduleCoordinator } = globalThis.TimeCoreDomain;

const calls = [];
const planner = {
  planCountdown(input) {
    calls.push({ kind: 'countdown', input });
    return [
      { key: 'cd:1000', kind: 'tick', epoch: 1000 },
      { key: 'cd:2000', kind: 'fire', epoch: 2000, fireKey: 'fire:2000' }
    ];
  },
  planFreeRun(nowEpoch) {
    calls.push({ kind: 'free', nowEpoch });
    return { key: 'fr:3000', kind: 'tick', epoch: 3000 };
  }
};

const coordinator = createAudioScheduleCoordinator(planner);
assert.equal(coordinator.reanchorIfDue(1000, 10), false);
coordinator.anchor(1000, 10);
assert.equal(coordinator.reanchorIfDue(2000, () => 11), false);

const input = { armed: true, fired: false, targetEpoch: 2000, nowEpoch: 0, lookaheadMs: 220, softLead: 10, tickOn: true, metroFull: true, freerun: true };
const first = coordinator.planCountdown(input);
assert.equal(first.length, 2);
assert.equal(first[0].audioTime, 10);
assert.equal(first[1].audioTime, 11);
assert.equal(coordinator.hasFireKey(2000), true);
assert.equal(coordinator.scheduledSize(), 3);
assert.equal(coordinator.planCountdown(input).length, 0);
assert.equal(calls[0].input, input);

const free = coordinator.planFreeRun(3000);
assert.equal(free.audioTime, 12);
assert.equal(coordinator.planFreeRun(3000), null);
assert.equal(coordinator.scheduledSize(), 4);

assert.equal(coordinator.reanchorIfDue(30999, () => 40), false);
assert.equal(coordinator.reanchorIfDue(31001, () => 41), true);
const afterReanchor = coordinator.planFreeRun(3000);
assert.equal(afterReanchor, null);
assert.equal(coordinator.planCountdown({ ...input, nowEpoch: 31001 }).length, 0);

coordinator.clearScheduled();
assert.equal(coordinator.scheduledSize(), 0);
assert.equal(coordinator.hasFireKey(2000), false);

const unanchored = createAudioScheduleCoordinator(planner);
assert.throws(() => unanchored.planFreeRun(0), /not anchored/);

const bounded = createAudioScheduleCoordinator(planner, { maxScheduled: 2 });
bounded.anchor(0, 0);
bounded.planCountdown(input);
assert.equal(bounded.scheduledSize(), 0);

console.log('audio-schedule-coordinator contract: 18 assertions passed');
