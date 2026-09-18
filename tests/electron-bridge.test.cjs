const assert = require('node:assert/strict');

require('../js/generated/electron-bridge.js');
const { createElectronBridge } = globalThis.TimeCoreDomain;

const sent = [];
const invoked = [];
const listeners = new Map();
const ipc = {
  send(channel, ...args) { sent.push({ channel, args }); },
  invoke(channel, ...args) {
    invoked.push({ channel, args });
    return Promise.resolve({ channel, args });
  },
  on(channel, listener) { listeners.set(channel, listener); },
  removeListener(channel, listener) {
    if (listeners.get(channel) === listener) listeners.delete(channel);
  }
};

(async () => {
  const bridge = createElectronBridge(ipc);
  assert.equal(bridge.isElectron, true);

  bridge.send('top');
  assert.deepEqual(sent[0], { channel: 'win', args: ['top', undefined] });
  bridge.send('size', { preset: 'clock' });
  assert.deepEqual(sent[1], { channel: 'win', args: ['size', { preset: 'clock' }] });
  bridge.send('not-a-window-command');
  assert.equal(sent.length, 2);

  assert.deepEqual(await bridge.get(), { channel: 'win:get', args: [] });
  assert.deepEqual(invoked[0], { channel: 'win:get', args: [] });

  const states = [];
  const unsubscribe = bridge.onState(state => states.push(state));
  assert.equal(listeners.has('win:state'), true);
  listeners.get('win:state')('event', { clock: true, fs: false, top: true });
  assert.deepEqual(states, [{ clock: true, fs: false, top: true }]);
  unsubscribe();
  assert.equal(listeners.has('win:state'), false);

  assert.deepEqual(await bridge.adb('detect', { path: 'adb' }), {
    channel: 'adb:detect', args: [{ path: 'adb' }]
  });
  assert.deepEqual(await bridge.adb('exec', { path: 'adb', args: ['version'] }), {
    channel: 'adb:exec', args: [{ path: 'adb', args: ['version'] }]
  });
  assert.deepEqual(await bridge.adb('download'), { channel: 'adb:download', args: [undefined] });
  await assert.rejects(() => bridge.adb('shell'), /bad adb cmd/);
  await assert.rejects(() => bridge.adb(null), /bad adb cmd/);
  assert.equal(invoked.length, 4);

  console.log('electron-bridge contract: 15 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
