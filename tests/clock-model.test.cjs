const assert = require('node:assert/strict');

require('../js/generated/clock-model.js');
const { createClockModel } = globalThis.TimeCoreDomain;

const clock = createClockModel({ initialEpoch: 100000, initialMonotonicMs: 0 });
assert.equal(clock.epochAt(0), 100000);
assert.equal(clock.epochAt(250), 100250);
assert.equal(clock.tick(0), 0);

clock.setTargetOffset(1000);
assert.ok(clock.tick(100) > 0);
const forward = clock.epochAt(100);
assert.equal(clock.targetOffset, 1000);

clock.setTargetOffset(0);
const beforeReturn = clock.epochAt(200);
const movedBack = clock.tick(200);
const afterReturn = clock.epochAt(200);
assert.ok(movedBack < 0);
assert.ok(Math.abs(afterReturn - (beforeReturn + movedBack)) < 1e-9);
assert.ok(afterReturn >= forward);

const jump = createClockModel({ initialEpoch: 0, initialMonotonicMs: 0 });
jump.setTargetOffset(-10000);
jump.tick(1000);
const beforeLargeCorrection = jump.epochAt(1000);
jump.tick(2000);
const afterLargeCorrection = jump.epochAt(2000);
assert.ok(afterLargeCorrection > beforeLargeCorrection);
assert.ok(beforeLargeCorrection - afterLargeCorrection < 1000);

const backwardsMono = createClockModel({ initialEpoch: 0, initialMonotonicMs: 0 });
backwardsMono.setTargetOffset(-1000);
backwardsMono.tick(100);
const stable = backwardsMono.offset;
assert.equal(backwardsMono.tick(50), 0);
assert.equal(backwardsMono.offset, stable);

console.log('clock-model contract: 12 assertions passed');
