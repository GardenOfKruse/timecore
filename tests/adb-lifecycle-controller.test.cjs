const assert = require('node:assert/strict');

require('../js/generated/adb-lifecycle-controller.js');
const { createAdbLifecycleController } = globalThis.TimeCoreDomain;

(async () => {
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
let supported = false;
let available = false;
let devices = 1;
let detectCalls = 0;
let scanCalls = 0;
let armCalls = [];
let haltCalls = 0;
let configValues = [];
let persisted = 0;
let rendered = 0;
let logs = [];
let countdown = { armed: true, target: 1234 };
let releaseDetect;
let deferred = false;

const controller = createAdbLifecycleController({
  initialEnabled: false,
  isSupported: () => supported,
  setConfigEnabled: value => configValues.push(value),
  persist: () => { persisted++; },
  halt: () => { haltCalls++; },
  detect: async () => {
    detectCalls++;
    if (deferred) await new Promise(resolve => { releaseDetect = resolve; });
    available = true;
  },
  isAvailable: () => available,
  hasDevices: () => devices > 0,
  scan: () => { scanCalls++; },
  countdown: () => countdown,
  arm: target => { armCalls.push(target); },
  render: () => { rendered++; },
  log: message => logs.push(message)
});

equal(controller.state(), { enabled: false });
await controller.setEnabled(true);
equal(controller.state(), { enabled: true });
equal(detectCalls, 0);
equal(scanCalls, 0);
equal(armCalls, []);

supported = true;
available = false;
await controller.setEnabled(true);
equal(detectCalls, 1);
equal(scanCalls, 1);
equal(armCalls, [1234]);
equal(configValues, [true, true]);
equal(persisted, 2);
equal(rendered, 2);
equal(logs.slice(-1), ['ADB 齐射已启用']);

await controller.setEnabled(false);
equal(controller.state(), { enabled: false });
equal(haltCalls, 1);
equal(configValues.slice(-1), [false]);
equal(logs.slice(-1), ['ADB 齐射已停用（不扫描、不发射）']);

deferred = true;
available = false;
const pending = controller.setEnabled(true);
await Promise.resolve();
await controller.setEnabled(false);
releaseDetect();
await pending;
equal(controller.state(), { enabled: false });
equal(scanCalls, 1);
equal(armCalls, [1234]);
equal(haltCalls, 2);

deferred = false;
countdown = { armed: false };
available = false;
await controller.setEnabled(true);
equal(scanCalls, 2);
equal(armCalls, [1234]);
assert.equal(configValues.at(-1), true); assertions++;
assert.equal(persisted, 6); assertions++;
assert.equal(rendered, 6); assertions++;
console.log(`adb-lifecycle-controller contract: ${assertions} assertions passed`);
})();
