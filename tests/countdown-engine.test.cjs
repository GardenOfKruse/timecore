const assert = require('node:assert/strict');
require('../js/generated/countdown-engine.js');
const { createCountdownEngine, nextAlignedNode } = globalThis.TimeCoreDomain;

function types(events) {
  return events.map(event => event.type);
}

const engine = createCountdownEngine({ midnightEpoch: () => 0 });
assert.equal(nextAlignedNode(5000, 6100, () => 0), 10000);
assert.deepEqual(types(engine.startSingle(25000, 10000)), ['start']);
assert.equal(engine.snapshot().phase, 'NORMAL');
assert.deepEqual(types(engine.update(15001)), ['phase']);
assert.equal(engine.snapshot().phase, 'WARMUP');
assert.deepEqual(types(engine.update(20001)), ['phase']);
assert.equal(engine.snapshot().phase, 'SURGE');
assert.deepEqual(types(engine.update(22001)), ['phase']);
assert.equal(engine.snapshot().phase, 'PULSE');
assert.deepEqual(types(engine.update(25000)), ['zero']);
assert.equal(engine.snapshot().fired, true);
assert.deepEqual(types(engine.update(26799)), []);
assert.deepEqual(types(engine.update(26800)), ['done', 'phase']);
assert.equal(engine.snapshot().armed, false);

const cycles = createCountdownEngine({ midnightEpoch: () => 0 });
assert.deepEqual(types(cycles.startAligned(5000, 2, false, 6100)), ['start']);
assert.equal(cycles.snapshot().target, 10000);
assert.deepEqual(types(cycles.update(11000)), ['zero']);
assert.deepEqual(types(cycles.update(12800)), ['advance']);
assert.equal(cycles.snapshot().target, 15000);
assert.equal(cycles.snapshot().cycleIndex, 2);
assert.deepEqual(types(cycles.update(15000)), ['zero']);
assert.deepEqual(types(cycles.update(16800)), ['done', 'phase']);

const infinite = createCountdownEngine({ midnightEpoch: () => 0 });
infinite.startAligned(5000, 1, true, 6100);
infinite.update(10000);
infinite.update(11800);
assert.equal(infinite.snapshot().armed, true);
assert.equal(infinite.snapshot().target, 15000);
assert.equal(infinite.snapshot().cycleIndex, 2);

const stopped = createCountdownEngine();
assert.deepEqual(types(stopped.startSingle(2000, 1000)), ['start']);
assert.deepEqual(types(stopped.stop()), ['stop', 'phase']);
assert.deepEqual(types(stopped.stop()), ['phase']);
assert.deepEqual(types(stopped.startAligned(999, 1, false, 0)), []);

console.log('countdown-engine contract: 19 assertions passed');
