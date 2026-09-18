const assert = require('node:assert/strict');

require('../js/generated/audio-schedule-planner.js');
const { createAudioSchedulePlanner } = globalThis.TimeCoreDomain;

const planner = createAudioSchedulePlanner();
const base = {
  armed: true,
  fired: false,
  targetEpoch: 20000,
  nowEpoch: 10000,
  lookaheadMs: 10000,
  softLead: 5,
  tickOn: true,
  metroFull: true,
  freerun: true
};

const full = planner.planCountdown(base);
assert.equal(full.length, 11);
assert.deepEqual(full.map(x => x.kind), [
  'fire', 'beep', 'beep', 'beep',
  'tick', 'tick', 'tick', 'tick', 'tick', 'tick', 'tick'
]);
assert.deepEqual(full.map(x => x.epoch), [20000, 19000, 18000, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000]);
assert.equal(full[0].key, 'cd20000:0');
assert.equal(full[0].fireKey, 'fire:20000');
assert.equal(full[1].beatIndex, 1);
assert.equal(full[10].beatIndex, 10);

const softOnly = planner.planCountdown({ ...base, metroFull: false, freerun: false });
assert.deepEqual(softOnly.map(x => x.kind), ['fire', 'beep', 'beep', 'beep', 'tick', 'tick']);

const noTick = planner.planCountdown({ ...base, tickOn: false });
assert.deepEqual(noTick.map(x => x.kind), ['fire', 'beep', 'beep', 'beep']);

const narrow = planner.planCountdown({ ...base, lookaheadMs: 220 });
assert.deepEqual(narrow.map(x => [x.key, x.epoch]), [['cd20000:10', 10000]]);

assert.deepEqual(planner.planCountdown({ ...base, armed: false }), []);
assert.deepEqual(planner.planCountdown({ ...base, fired: true }), []);
assert.equal(planner.planFreeRun(1234).key, 'fr2000');
assert.equal(planner.planFreeRun(1234).epoch, 2000);
assert.equal(planner.planFreeRun(1821).epoch, 3000);
assert.throws(() => planner.planCountdown({ ...base, targetEpoch: Number.NaN }), /epoch/i);
assert.throws(() => planner.planFreeRun(Number.NaN), /epoch/i);

console.log('audio-schedule-planner contract: 20 assertions passed');
