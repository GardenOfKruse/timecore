const assert = require('node:assert/strict');

require('../js/generated/window-command-model.js');
const { createWindowCommandModel } = globalThis.TimeCoreDomain;
const model = createWindowCommandModel();

assert.deepEqual(model.route('top'), { type: 'toggle-top' });
assert.deepEqual(model.route('opacity', 0), { type: 'set-opacity', value: 1 });
assert.deepEqual(model.route('opacity', 0.1), { type: 'set-opacity', value: 0.3 });
assert.deepEqual(model.route('opacity', 2), { type: 'set-opacity', value: 1 });
assert.deepEqual(model.route('minimize'), { type: 'minimize' });
assert.deepEqual(model.route('fullscreen'), { type: 'toggle-fullscreen' });
assert.deepEqual(model.route('size', { preset: 'clock' }), { type: 'size', preset: 'clock' });
assert.equal(model.route('size', 'clock'), null);
assert.deepEqual(model.route('move-begin'), { type: 'move-begin' });
assert.deepEqual(model.route('move-end'), { type: 'move-end' });
assert.deepEqual(model.route('clock-button', 1), { type: 'set-left-button', held: true });
assert.deepEqual(model.route('clock-button', 0), { type: 'set-left-button', held: false });
assert.deepEqual(model.route('clock-zoom', { delta: -120, buttons: 1 }), {
  type: 'zoom-clock', delta: -120, buttons: 1
});
assert.deepEqual(model.route('clock-zoom', 120), { type: 'zoom-clock', delta: 120, buttons: 0 });
assert.deepEqual(model.route('open', 'https://github.com/GardenOfKruse/timecore/releases'), {
  type: 'open', url: 'https://github.com/GardenOfKruse/timecore/releases'
});
assert.equal(model.route('open', 'https://example.com'), null);
assert.equal(model.route('open', 'http://github.com/GardenOfKruse/timecore'), null);
assert.deepEqual(model.route('flash'), { type: 'flash' });   // v1.22.0 到点任务栏闪烁
assert.deepEqual(model.route('close'), { type: 'close' });
assert.equal(model.route('unknown'), null);

assert.deepEqual(model.snapshot({ clock: 1, top: '', fs: true }), {
  clock: true, top: false, fs: true
});
assert.deepEqual(model.snapshot({}), { clock: false, top: false, fs: false });

console.log('window-command-model contract: 21 assertions passed');
