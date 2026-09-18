const assert = require('node:assert/strict');

require('../js/generated/runtime-loop.js');
const { createRuntimeLoop } = globalThis.TimeCoreDomain;

const intervals = [];
const frames = [];
const cancelledFrames = [];
const clearedIntervals = [];
const rendered = [];
const logicalEpochs = [];
const events = [];
let now = 1000;
let epoch = 120000;
let info = { armed: false, fired: false, remainingMs: 0, progress: 0, phase: 'IDLE' };

const platform = {
  now: () => now,
  epoch: () => epoch,
  requestFrame(listener) {
    const handle = { listener };
    frames.push(handle);
    return handle;
  },
  cancelFrame(handle) {
    cancelledFrames.push(handle);
  },
  setInterval(listener, delayMs) {
    const handle = { listener, delayMs };
    intervals.push(handle);
    return handle;
  },
  clearInterval(handle) {
    clearedIntervals.push(handle);
  }
};

const loop = createRuntimeLoop(platform, {
  logical(value) {
    logicalEpochs.push(value);
    events.push('logical');
    return info;
  },
  watchdog() {
    events.push('watchdog');
  },
  renderScene(dt, frame) {
    rendered.push({ dt, frame });
    events.push('scene');
  }
});

loop.start();
loop.start();
assert.deepEqual(intervals.map(item => item.delayMs), [66, 120]);
assert.equal(frames.length, 1);

intervals[0].listener();
assert.deepEqual(logicalEpochs, [120000]);
intervals[1].listener();
assert.equal(events.at(-1), 'watchdog');

frames[0].listener(1000);
assert.equal(frames.length, 2);

info = { armed: true, fired: false, remainingMs: 1999, progress: 0.25, phase: 'NORMAL' };
epoch = 121234;
now = 1016;
frames[1].listener(1016);
assert.equal(frames.length, 3);
assert.equal(rendered.length, 1);
assert.equal(rendered[0].dt, 0.016);
assert.deepEqual(rendered[0].frame, {
  epoch: 121234,
  phase: 'NORMAL',
  progress: 0.25,
  pulse: 0.5,
  armed: true
});

info = { armed: false, fired: false, remainingMs: 0, progress: 0, phase: 'IDLE' };
epoch = 122000;
now = 1216;
frames[2].listener(1216);
assert.equal(rendered[1].frame.progress, ((122000 / 1000) % 60) / 60);
assert.equal(rendered[1].frame.pulse < 0.5, true);

loop.stop();
assert.equal(clearedIntervals.length, 2);
assert.equal(cancelledFrames.length, 1);

console.log('runtime-loop contract: 18 assertions passed');
