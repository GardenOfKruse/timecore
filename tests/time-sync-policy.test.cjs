const assert = require('node:assert/strict');

require('../js/generated/time-sync-policy.js');
const { createTimeSyncPolicy } = globalThis.TimeCoreDomain;

const policy = createTimeSyncPolicy();
const samples = [
  { src: 'slow', offset: 120, rtt: 200 },
  { src: 'fast', offset: 125.4, rtt: 80 },
  { src: 'third', offset: 500, rtt: 90 }
];

let decision = policy.decide(samples, 10_000, 0);
assert.equal(decision.status, 'synced');
assert.equal(decision.chosen.src, 'fast');
assert.equal(decision.targetOffset, 125);
assert.equal(decision.retryDelayMs, 300_000);
assert.equal(samples[0].src, 'slow');

decision = policy.decide([{ src: 'one', offset: 12.6, rtt: 349.9 }], 10_000, 0);
assert.equal(decision.status, 'synced');
assert.equal(decision.targetOffset, 13);

decision = policy.decide([{ src: 'border', offset: 10, rtt: 350 }], 10_000, 0);
assert.equal(decision.status, 'failed');
assert.equal(decision.targetOffset, 0);
assert.equal(decision.retryDelayMs, 60_000);

decision = policy.decide([
  { src: 'a', offset: 0, rtt: 401 },
  { src: 'b', offset: 500, rtt: 450 }
], 10_000, 0);
assert.equal(decision.status, 'failed');

decision = policy.decide([
  { src: 'a', offset: 0, rtt: 401 },
  { src: 'b', offset: 500, rtt: 450 }
], 10_000, 9_000);
assert.equal(decision.status, 'stale');
assert.equal(decision.targetOffset, null);

decision = policy.decide([], 9_000 + 30 * 60000, 9_000);
assert.equal(decision.status, 'failed');

decision = policy.decide([
  { src: 'good', offset: 30, rtt: 100 },
  { src: 'different', offset: 500, rtt: 120 }
], 10_000, 0);
assert.equal(decision.status, 'synced');
assert.equal(decision.chosen.src, 'good');

decision = policy.decide([
  { src: 'bad-offset', offset: Number.NaN, rtt: 20 },
  { src: 'good', offset: 8, rtt: 100 }
], 10_000, 0);
assert.equal(decision.status, 'synced');
assert.equal(decision.chosen.src, 'good');

const custom = createTimeSyncPolicy({ freshWindowMs: 1000, syncedRetryMs: 2000, fallbackRetryMs: 300 });
decision = custom.decide([], 1_500, 1_000);
assert.equal(decision.status, 'stale');
assert.equal(decision.retryDelayMs, 300);
decision = custom.decide([{ src: 'custom', offset: 1, rtt: 1 }], 1_500, 1_000);
assert.equal(decision.retryDelayMs, 2000);

console.log('time-sync-policy contract: 18 assertions passed');
