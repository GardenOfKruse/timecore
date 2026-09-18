const assert = require('node:assert/strict');

require('../js/generated/clock-motion-model.js');
const { createClockMotionModel } = globalThis.TimeCoreDomain;
const model = createClockMotionModel();
const animated = { clockMode: true, reduced: false, supported: true };

assert.equal(model.normalizePhase('warmup'), 'WARMUP');
assert.equal(model.normalizePhase('not-a-phase'), 'IDLE');
assert.deepEqual(model.plan('NORMAL', { clockMode: false, reduced: false, supported: true }), {
  phase: 'NORMAL', mode: 'inactive', staticOpacity: null, profile: null
});
assert.deepEqual(model.plan('IDLE', animated), {
  phase: 'IDLE', mode: 'inactive', staticOpacity: null, profile: null
});
assert.deepEqual(model.plan('WARMUP', { ...animated, reduced: true }), {
  phase: 'WARMUP', mode: 'static', staticOpacity: 0.24, profile: null
});
assert.deepEqual(model.plan('ZERO', { ...animated, supported: false }), {
  phase: 'ZERO', mode: 'static', staticOpacity: 0.58, profile: null
});
assert.deepEqual(model.plan('ZERO', animated), {
  phase: 'ZERO', mode: 'release', staticOpacity: null, profile: null
});

const normal = model.plan('NORMAL', animated);
assert.equal(normal.mode, 'heartbeat');
assert.deepEqual(normal.profile, { duration: 2600, peak: 0.42, second: 0.25, scale: 1.004, dip: 0.988 });
const pulse = model.plan('PULSE', animated);
assert.deepEqual(pulse.profile, { duration: 620, peak: 0.76, second: 0.48, scale: 1.007, dip: 0.974 });
assert.notEqual(normal.profile, pulse.profile);

const profile = normal.profile;
profile.duration = 1;
assert.equal(model.plan('NORMAL', animated).profile.duration, 2600);
assert.equal(model.plan('SURGE', animated).profile.duration, 1100);
assert.equal(model.plan('PULSE', animated).profile.scale, 1.007);
console.log('clock-motion-model contract: 15 assertions passed');
