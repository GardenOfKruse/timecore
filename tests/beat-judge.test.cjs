const assert = require('node:assert/strict');

require('../js/generated/beat-judge.js');
const { createBeatJudge } = globalThis.TimeCoreDomain;

const judge = createBeatJudge();
assert.equal(judge.labelFor(0), 'PERFECT');
assert.equal(judge.labelFor(60), 'PERFECT');
assert.equal(judge.labelFor(61), 'GREAT');
assert.equal(judge.labelFor(140), 'GREAT');
assert.equal(judge.labelFor(141), 'GOOD');
assert.equal(judge.labelFor(300), 'GOOD');
assert.equal(judge.labelFor(301), 'MISS');

const perfect = judge.judge({ at: 1030, nodeEpoch: 1000, mode: 'cd' });
assert.deepEqual(perfect, {
  label: 'PERFECT', color: '#8ef7ff', dev: 30, combo: 1, maxCombo: 1, acc: 1, mode: 'cd', at: 1030
});
const great = judge.judge({ at: 1100, nodeEpoch: 1000, mode: 'cd' });
assert.equal(great.combo, 2);
assert.equal(great.dev, 100);
const good = judge.judge({ at: 1200, nodeEpoch: 1000, mode: 'free' });
assert.equal(good.combo, 3);
assert.equal(good.mode, 'free');
const miss = judge.judge({ at: 1400, nodeEpoch: 1000, mode: 'cd' });
assert.equal(miss.label, 'MISS');
assert.equal(miss.combo, 0);
assert.equal(miss.maxCombo, 3);
assert.equal(miss.acc, 0.5);

const forced = judge.judge({ at: 9999, nodeEpoch: 1000, mode: 'cd', forcedDeviation: -60 });
assert.equal(forced.dev, -60);
assert.equal(forced.label, 'PERFECT');

const stats = judge.stats();
assert.equal(stats.total, 5);
assert.deepEqual(stats.counts, { PERFECT: 2, GREAT: 1, GOOD: 1, MISS: 1 });
assert.equal(stats.combo, 1);
assert.equal(stats.maxCombo, 3);
assert.equal(stats.last.at, 9999);
assert.throws(() => judge.judge({ at: Number.NaN, nodeEpoch: 1000, mode: 'cd' }), /epoch/i);

console.log('beat-judge contract: 22 assertions passed');
