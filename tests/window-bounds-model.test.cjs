const assert = require('node:assert/strict');

require('../js/generated/window-bounds-model.js');
const { createWindowBoundsModel } = globalThis.TimeCoreDomain;

const model = createWindowBoundsModel();
const work = { x: 0, y: 0, width: 1920, height: 1080 };
const current = { x: 100, y: 100, width: 1000, height: 700 };

assert.deepEqual(model.getPreset('standard'), { width: 1180, height: 760 });
assert.deepEqual(model.getPreset('small'), { width: 480, height: 320 });
assert.deepEqual(model.getPreset('clock'), { width: 280, height: 96 });
assert.deepEqual(model.getPreset('compact'), { width: 660, height: 460 });
assert.deepEqual(model.getPreset('mini'), { width: 380, height: 300 });
assert.equal(model.getPreset('unknown'), null);

assert.deepEqual(model.centerPreset(current, work, { width: 1180, height: 760 }), {
  x: 10, y: 70, width: 1180, height: 760
});
assert.deepEqual(model.centerPreset(current, { x: 0, y: 0, width: 500, height: 300 }, { width: 1180, height: 760 }), {
  x: 10, y: 10, width: 490, height: 290
});
assert.deepEqual(model.clampToWork({ x: -100, y: 900, width: 500, height: 300 }, work), {
  x: 0, y: 780, width: 500, height: 300
});

assert.deepEqual(model.clockSize(), { width: 280, height: 96 });
assert.deepEqual(model.clockSize(120), { width: 160, height: 55 });
assert.deepEqual(model.clockSize(308), { width: 308, height: 106 });
assert.deepEqual(model.clockSize(2000), { width: 1180, height: 405 });

const zoomIn = model.zoomClock({ x: 100, y: 100, width: 280, height: 96 }, work, -1);
assert.deepEqual(zoomIn, { x: 86, y: 95, width: 308, height: 106 });
const zoomOut = model.zoomClock(zoomIn, work, 1);
assert.deepEqual(zoomOut, { x: 100, y: 100, width: 280, height: 96 });
assert.equal(model.zoomClock({ x: 0, y: 0, width: 160, height: 55 }, work, 1), null);
assert.equal(model.zoomClock({ x: 0, y: 0, width: 1180, height: 405 }, work, -1), null);
assert.deepEqual(model.zoomClock({ x: 1800, y: 900, width: 280, height: 96 }, work, -1), {
  x: 1612, y: 895, width: 308, height: 106
});
assert.throws(() => model.zoomClock({ x: 0, y: 0, width: 280, height: 96 }, work, Number.NaN), /delta/i);

console.log('window-bounds-model contract: 19 assertions passed');
