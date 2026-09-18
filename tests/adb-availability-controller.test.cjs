const assert = require('node:assert/strict');

require('../js/generated/adb-availability-controller.js');
const { createAdbAvailabilityController } = globalThis.TimeCoreDomain;

(async () => {
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
let supported = false;
const events = [];
const calls = [];
const detectResponses = [
  { ok: true, path: 'manual-adb.exe', version: '1.0.36' },
  { ok: false, error: 'not found' },
  { ok: true, path: 'platform-adb.exe', version: '1.0.41' }
];
const downloadResponses = [
  { ok: true },
  { ok: false, error: 'network down' }
];
const controller = createAdbAvailabilityController({
  executor: {
    async detect(explicit) { calls.push(['detect', explicit]); return detectResponses.shift(); },
    async download() { calls.push(['download']); return downloadResponses.shift(); }
  },
  initial: { path: 'saved-adb.exe', version: '', ok: false, ancient: false },
  isSupported: () => supported,
  setPath: path => events.push(['path', path]),
  persist: () => events.push(['persist']),
  render: () => events.push(['render']),
  scan: () => { events.push(['scan']); return Promise.resolve(); },
  log: message => events.push(['log', message])
});

equal(await controller.detect(), { ok: false });
equal(await controller.download(), { ok: false });
equal(calls, []);
equal(events, []);

supported = true;
equal(await controller.detect('manual-adb.exe'), { ok: true, path: 'manual-adb.exe', version: '1.0.36' });
equal(controller.state(), { ok: true, path: 'manual-adb.exe', version: '1.0.36', ancient: true });
equal(calls, [['detect', 'manual-adb.exe']]);
equal(events, [['path', 'manual-adb.exe'], ['persist'], ['render']]);

equal(await controller.detect(), { ok: false, error: 'not found' });
equal(controller.state(), { ok: false, path: 'manual-adb.exe', version: '1.0.36', ancient: true });
equal(events.slice(-1), [['render']]);

equal(await controller.download(), { ok: true });
equal(controller.state(), { ok: true, path: 'platform-adb.exe', version: '1.0.41', ancient: false });
equal(calls, [
  ['detect', 'manual-adb.exe'],
  ['detect', undefined],
  ['download'],
  ['detect', undefined]
]);
equal(events.slice(-8), [
  ['log', '开始下载 adb（官方 platform-tools，约 6MB）…'],
  ['log', 'adb 下载完成，已自动放置'],
  ['path', ''],
  ['persist'],
  ['path', 'platform-adb.exe'],
  ['persist'],
  ['render'],
  ['scan']
]);

equal(await controller.download(), { ok: false, error: 'network down' });
equal(events.slice(-2), [['log', '开始下载 adb（官方 platform-tools，约 6MB）…'], ['log', '下载失败：network down']]);
assert.equal(calls.filter(call => call[0] === 'download').length, 2); assertions++;
assert.equal(events.filter(event => event[0] === 'persist').length, 3); assertions++;
assert.equal(events.filter(event => event[0] === 'render').length, 3); assertions++;
assert.equal(events.filter(event => event[0] === 'scan').length, 1); assertions++;
console.log(`adb-availability-controller contract: ${assertions} assertions passed`);
})();
