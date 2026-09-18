const assert = require('node:assert/strict');

require('../js/generated/adb-executor.js');
const { createAdbExecutor } = globalThis.TimeCoreDomain;

const calls = [];
const transport = {
  adb(command, payload) {
    calls.push({ command, payload });
    return Promise.resolve({ command, payload, ok: true });
  }
};

(async () => {
  const executor = createAdbExecutor(transport);
  assert.deepEqual(await executor.detect(), { command: 'detect', payload: { path: '' }, ok: true });
  assert.deepEqual(await executor.detect('E:\\Tools\\adb\\adb.exe'), {
    command: 'detect', payload: { path: 'E:\\Tools\\adb\\adb.exe' }, ok: true
  });
  assert.deepEqual(await executor.detect(null), { command: 'detect', payload: { path: '' }, ok: true });

  assert.deepEqual(await executor.exec('', ['version']), {
    command: 'exec', payload: { path: 'adb', args: ['version'] }, ok: true
  });
  const args = ['-s', 'device', 'shell', 'echo tc'];
  assert.deepEqual(await executor.exec('adb.exe', args, { timeoutMs: 5000 }), {
    command: 'exec', payload: { path: 'adb.exe', args, timeoutMs: 5000 }, ok: true
  });
  args.push('mutated-after-call');
  assert.deepEqual(calls[4].payload.args, ['-s', 'device', 'shell', 'echo tc']);
  assert.deepEqual(await executor.exec('adb.exe', ['exec-out', 'screencap', '-p'], { timeoutMs: 15000, binary: true }), {
    command: 'exec', payload: { path: 'adb.exe', args: ['exec-out', 'screencap', '-p'], timeoutMs: 15000, binary: true }, ok: true
  });
  assert.deepEqual(await executor.exec('adb.exe', ['input', 'tap', '1', '2'], { binary: false }), {
    command: 'exec', payload: { path: 'adb.exe', args: ['input', 'tap', '1', '2'] }, ok: true
  });
  assert.deepEqual(await executor.download(), { command: 'download', payload: {}, ok: true });
  assert.equal(calls.length, 8);

  console.log('adb-executor contract: 11 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
