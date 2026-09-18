const assert = require('node:assert/strict');

require('../js/generated/camera-motion-model.js');
const { createCameraMotionModel } = globalThis.TimeCoreDomain;
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);

const model = createCameraMotionModel();
assert.deepEqual(model.state(), { yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0 });

const dragged = model.drag(120, -120);
closeTo(dragged.targetYaw, -1.08);
closeTo(dragged.targetPitch, 0.84);
assert.equal(dragged.yaw, 0);
assert.equal(dragged.pitch, 0);

const unchanged = model.update(0);
assert.deepEqual(unchanged, dragged);
const moved = model.update(0.1);
assert.equal(moved.yaw < 0 && moved.yaw > -1.08, true);
assert.equal(moved.pitch > 0 && moved.pitch < 0.84, true);

model.drag(0, -1000);
assert.equal(model.state().targetPitch, 1.15);
model.drag(0, 1000);
assert.equal(model.state().targetPitch, -1.15);

model.drag(Number.NaN, Number.POSITIVE_INFINITY);
closeTo(model.state().targetYaw, -1.08);
assert.equal(model.state().targetPitch, -1.15);

const custom = createCameraMotionModel({
  yawSensitivity: 0.01,
  pitchSensitivity: 0.02,
  minPitch: -0.5,
  maxPitch: 0.5,
  smoothing: 4
});
custom.drag(10, -10);
assert.deepEqual(custom.state(), { yaw: 0, targetYaw: -0.1, pitch: 0, targetPitch: 0.2 });
custom.update(0.25);
assert.equal(custom.state().yaw < 0 && custom.state().yaw > -0.1, true);

const detached = custom.state();
detached.targetYaw = 999;
assert.notEqual(custom.state().targetYaw, 999);

custom.reset();
assert.deepEqual(custom.state(), { yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0 });

console.log('camera-motion-model contract: 18 assertions passed');
