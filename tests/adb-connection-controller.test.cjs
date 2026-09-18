const assert = require('node:assert/strict');

require('../js/generated/adb-connection-controller.js');
const { createAdbConnectionController } = globalThis.TimeCoreDomain;

(async () => {
  let assertions = 0;
  const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
  const calls = [];
  const logs = [];
  const devices = new Map();
  let scans = 0;
  let availability = { path: 'adb-old.exe', version: '1.0.36', ancient: true };
  const controller = createAdbConnectionController({
    executor: {
      async exec(path, args, options) {
        calls.push({ path, args: [...args], options });
        return { stdout: 'connected to 192.168.1.8:5555\n' };
      }
    },
    availability: () => ({ ...availability }),
    scan: async () => { scans++; },
    device: serial => devices.get(serial),
    log: message => logs.push(message)
  });

  devices.set('192.168.1.8:5555', { state: 'offline' });
  await controller.connect('192.168.1.8:5555');
  equal(calls, [{ path: 'adb-old.exe', args: ['connect', '192.168.1.8:5555'], options: { timeoutMs: 8000 } }]);
  equal(scans, 1);
  equal(logs, [
    '⚠ adb 1.0.36 不支持 Android 11+ 无线调试（TLS 握手）——先点「⬇ 升级 adb」再连接',
    'connect 192.168.1.8:5555 → connected to 192.168.1.8:5555',
    '⚠ 192.168.1.8:5555 一直离线：旧版 adb 无法完成无线调试握手——「⬇ 升级 adb」装官方最新组件后重连即可'
  ]);

  availability = { path: 'adb.exe', version: '1.0.41', ancient: false };
  devices.set('192.168.1.9:5555', { state: 'device', name: 'Pixel' });
  await controller.connect('192.168.1.9:5555');
  equal(calls.at(-1), { path: 'adb.exe', args: ['connect', '192.168.1.9:5555'], options: { timeoutMs: 8000 } });
  equal(logs.slice(-2), [
    'connect 192.168.1.9:5555 → connected to 192.168.1.8:5555',
    '✓ 192.168.1.9:5555 已就绪（Pixel）'
  ]);

  await controller.connect('usb-serial');
  equal(logs.at(-1), 'connect usb-serial → connected to 192.168.1.8:5555');
  assert.equal(logs.filter(message => message.includes('不支持 Android 11+')).length, 1); assertions++;

  const longController = createAdbConnectionController({
    executor: { async exec() { return { stderr: 'x'.repeat(100) }; } },
    availability: () => ({ path: 'adb.exe', version: '', ancient: false }),
    scan: () => {},
    device: () => undefined,
    log: message => logs.push(message)
  });
  await longController.connect('192.168.1.10:5555');
  assert.equal(logs.at(-1).length, 'connect 192.168.1.10:5555 → '.length + 60); assertions++;
  console.log(`adb-connection-controller contract: ${assertions} assertions passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
