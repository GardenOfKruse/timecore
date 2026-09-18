const assert = require('node:assert/strict');

require('../js/generated/adb-fire-controller.js');
const { createAdbFireController } = globalThis.TimeCoreDomain;

const logs = [];
const builds = [];
const executions = [];
const builder = {
  build(action, device, options) {
    builds.push({ action, device, options });
    return `input tap ${action.x} ${action.y}`;
  }
};
const executor = {
  exec(path, args, options) {
    executions.push({ path, args, options });
    return Promise.resolve({ ok: true, durMs: 42 });
  }
};
const controller = createAdbFireController({
  executor,
  scriptBuilder: builder,
  clock: { epoch: () => 10000 },
  logger: { log: message => logs.push(message) }
});
const action = { type: 'tap', name: '中心点', x: 5, y: 6 };
const device = { serial: 'usb-1', name: '测试机', L: 100 };
const base = { action, device, adbPath: 'adb.exe', dry: true, compensate: true, calibrated: true };

(async () => {
controller.dispatch({ ...base, mode: 'test' });
assert.equal(logs[0], '【演练】→ 测试机：input tap 5 6');
assert.equal(executions.length, 0);
assert.equal(builds[0].options.compensate, true);

controller.dispatch({ ...base, mode: 'scheduled', precise: true, fireEpoch: 11000 });
assert.equal(logs[1], '【演练·预发射】→ 测试机 sleep=0.950s：input tap 5 6');

controller.dispatch({ ...base, mode: 'scheduled', precise: false, dry: false });
controller.dispatch({ ...base, mode: 'test', dry: false });
controller.dispatch({ ...base, mode: 'test', dry: false, tag: '点测' });
await new Promise(resolve => setImmediate(resolve));
assert.equal(executions.length, 3);
assert.deepEqual(executions[0], {
  path: 'adb.exe',
  args: ['-s', 'usb-1', 'shell', 'input tap 5 6'],
  options: { timeoutMs: 90000 }
});
assert.deepEqual(executions[1], executions[0]);
assert.equal(logs[2], '⚡ 测试机 → 完成 42ms');
assert.equal(logs[3], '试射 测试机 → 完成 42ms');
assert.equal(logs[4], '点测 测试机 → 完成 42ms');

console.log('adb-fire-controller contract: 11 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
