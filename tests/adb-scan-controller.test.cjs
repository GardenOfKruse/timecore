const assert = require('node:assert/strict');

require('../js/generated/adb-scan-controller.js');
const { createAdbScanController } = globalThis.TimeCoreDomain;

(async () => {
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const calls = [];
const events = [];
let available = false;
let nowEpoch = 1234;
let runIndex = 0;
const responses = [
  { ok: true, stdout: 'first' },
  { ok: true, stdout: 'same' },
  { ok: false, stderr: 'offline' },
  { ok: true, stdout: 'invalidated' }
];
const coordinatorInputs = [];
const coordinator = {
  async run(input) {
    coordinatorInputs.push({ ...input });
    runIndex++;
    if (runIndex === 1) return { changed: true, nameCount: 0, snapshot: { signature: 'sig-1' }, seen: ['usb-1'] };
    if (runIndex === 2) return { changed: false, nameCount: 2, snapshot: { signature: 'sig-1' }, seen: ['usb-1'] };
    return { changed: true, nameCount: 0, snapshot: { signature: 'sig-2' }, seen: ['usb-1', 'ip:5555'] };
  }
};
const controller = createAdbScanController({
  executor: {
    async exec(path, args, options) {
      calls.push({ path, args: [...args], options });
      return responses.shift();
    }
  },
  coordinator,
  isAvailable: () => available,
  getPath: () => 'adb-test',
  nowEpoch: () => nowEpoch,
  onChanged: result => events.push(['changed', result.snapshot.signature]),
  onPersist: () => events.push(['persist']),
  onGuide: () => events.push(['guide']),
  onLog: message => events.push(['log', message])
});

equal(await controller.scan(true), { status: 'skipped', changed: false, nameCount: 0, seenCount: 0 });
equal(calls, []);

available = true;
equal(await controller.scan(true), { status: 'completed', changed: true, nameCount: 0, seenCount: 1 });
equal(calls[0], { path: 'adb-test', args: ['devices', '-l'], options: { timeoutMs: 8000 } });
equal(coordinatorInputs[0], { stdout: 'first', nowEpoch: 1234, previousSignature: '', silent: true });
equal(events, [['changed', 'sig-1'], ['persist'], ['guide'], ['log', '扫描完成：1 台设备']]);

nowEpoch = 2345;
equal(await controller.scan(false), { status: 'completed', changed: false, nameCount: 2, seenCount: 1 });
equal(coordinatorInputs[1], { stdout: 'same', nowEpoch: 2345, previousSignature: 'sig-1', silent: false });
equal(events.slice(-3), [['persist'], ['guide'], ['log', '扫描完成：1 台设备']]);

equal(await controller.scan(), { status: 'failed', changed: false, nameCount: 0, seenCount: 0, error: 'offline' });
equal(events.at(-1), ['log', '扫描失败：offline']);

controller.invalidate();
equal(await controller.scan(true), { status: 'completed', changed: true, nameCount: 0, seenCount: 2 });
equal(coordinatorInputs[2], { stdout: 'invalidated', nowEpoch: 2345, previousSignature: '', silent: true });
equal(events.slice(-4), [['changed', 'sig-2'], ['persist'], ['guide'], ['log', '扫描完成：2 台设备']]);

assert.equal(calls.length, 4); assertions++;
assert.equal(coordinatorInputs.length, 3); assertions++;
assert.equal(events.filter(event => event[0] === 'changed').length, 2); assertions++;
assert.equal(events.filter(event => event[0] === 'persist').length, 3); assertions++;
assert.equal(events.filter(event => event[0] === 'guide').length, 3); assertions++;
console.log(`adb-scan-controller contract: ${assertions} assertions passed`);
})();
