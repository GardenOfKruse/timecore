const assert = require('node:assert/strict');

require('../js/generated/window-controller.js');
const { createWindowController } = globalThis.TimeCoreDomain;

const calls = [];
let currentRaw = { clock: false, fs: false, top: false, ver: '1.5.3' };
let pushListener = null;
let removed = 0;
const transport = {
  send(command, arg) { calls.push({ command, arg }); },
  get() { return Promise.resolve(currentRaw); },
  onState(listener) {
    pushListener = listener;
    return () => { removed++; pushListener = null; };
  }
};

(async () => {
  const controller = createWindowController(transport);
  assert.deepEqual(controller.state(), { clock: false, fs: false, top: false, ver: null });

  const seen = [];
  const unsubscribe = controller.subscribe(state => seen.push(state));
  assert.equal(seen.length, 0);
  await controller.refresh();
  assert.deepEqual(controller.state(), { clock: false, fs: false, top: false, ver: '1.5.3' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ver, '1.5.3');

  // 通过 connect 安装真实推送订阅，验证 push 与轮询共用同一去重路径。
  const disconnect = controller.connect(60000);
  assert.equal(typeof pushListener, 'function');
  pushListener({ clock: true, fs: false, top: true });
  assert.deepEqual(controller.state(), { clock: true, fs: false, top: true, ver: '1.5.3' });
  assert.equal(seen.length, 2);
  pushListener({ clock: true, fs: false, top: true });
  assert.equal(seen.length, 2);
  unsubscribe();
  disconnect();
  assert.equal(removed, 1);

  controller.toggleTop();
  assert.deepEqual(calls[calls.length - 1], { command: 'top', arg: undefined });
  controller.setOpacity(0.75);
  assert.deepEqual(calls[calls.length - 1], { command: 'opacity', arg: 0.75 });
  controller.minimize();
  assert.deepEqual(calls[calls.length - 1], { command: 'minimize', arg: undefined });
  controller.toggleFullscreen();
  assert.deepEqual(calls[calls.length - 1], { command: 'fullscreen', arg: undefined });
  controller.setSize('clock');
  assert.deepEqual(calls[calls.length - 1], { command: 'size', arg: { preset: 'clock' } });
  controller.beginMove();
  assert.deepEqual(calls[calls.length - 1], { command: 'move-begin', arg: undefined });
  controller.endMove();
  assert.deepEqual(calls[calls.length - 1], { command: 'move-end', arg: undefined });
  controller.setLeftButton(true);
  assert.deepEqual(calls[calls.length - 1], { command: 'clock-button', arg: true });
  controller.zoom(-120, 1);
  assert.deepEqual(calls[calls.length - 1], { command: 'clock-zoom', arg: { delta: -120, buttons: 1 } });
  controller.open('https://github.com/GardenOfKruse/timecore/releases');
  assert.deepEqual(calls[calls.length - 1], { command: 'open', arg: 'https://github.com/GardenOfKruse/timecore/releases' });
  controller.close();
  assert.deepEqual(calls[calls.length - 1], { command: 'close', arg: undefined });

  console.log('window-controller contract: 21 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
