const assert = require('node:assert/strict');

require('../js/generated/adb-screenshot-controller.js');
const { createAdbScreenshotController } = globalThis.TimeCoreDomain;

const calls = [];
const picks = [];
const logs = [];
let saves = 0;
let renders = 0;
const device = { serial: 'usb-1', name: '测试机', state: 'device', W: 1080, H: 2340 };
const action = { id: 'shot-1', name: '截图动作', x: '', y: '' };
const controller = createAdbScreenshotController({
  executor: {
    exec(path, args, options) {
      calls.push({ path, args, options });
      return Promise.resolve({ ok: true, b64: 'x'.repeat(120) });
    }
  },
  picker: { open: target => picks.push(target.id) },
  targets: { resolve: () => device },
  getAdbPath: () => 'adb.exe',
  save: () => { saves++; },
  render: () => { renders++; },
  log: message => logs.push(message)
});

(async () => {
  await controller.open(action, { capture: true, show: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'adb.exe');
  assert.deepEqual(calls[0].args, ['-s', 'usb-1', 'exec-out', 'screencap', '-p']);
  assert.deepEqual(calls[0].options, { timeoutMs: 15000, binary: true });
  assert.equal(action._shot.length, 120);
  assert.equal(action.shotW, 1080);
  assert.equal(action.shotH, 2340);
  assert.equal(action.x, 540);
  assert.equal(action.y, 1170);
  assert.deepEqual(picks, []);
  assert.equal(renders, 1);
  assert.equal(logs[0], '已截取 测试机 屏幕，点击截图选点');

  await controller.open(action);
  assert.deepEqual(picks, ['shot-1']);
  controller.select(action, 100, 200);
  assert.equal(saves, 1);
  assert.deepEqual([action.x, action.y], [100, 200]);
  assert.equal(logs[1], '「截图动作」选点 → 100,200');

  await controller.retake(action);
  assert.equal(calls.length, 2);
  assert.deepEqual(picks, ['shot-1', 'shot-1']);
  assert.equal(renders, 2);
  controller.close();
  assert.equal(renders, 3);

  const noDeviceLogs = [];
  const noDevice = createAdbScreenshotController({
    executor: { exec: () => Promise.resolve({ ok: true, b64: 'x'.repeat(120) }) },
    picker: { open: () => assert.fail('picker must stay closed') },
    targets: { resolve: () => null },
    getAdbPath: () => 'adb.exe',
    save: () => {},
    render: () => {},
    log: message => noDeviceLogs.push(message)
  });
  await noDevice.open({ id: 'none', name: '空动作' }, { capture: true });
  assert.equal(noDeviceLogs[0], '「空动作」没有在线设备，无法截屏选点');

  const failedLogs = [];
  const failed = createAdbScreenshotController({
    executor: { exec: () => Promise.resolve({ ok: false, stderr: 'permission denied' }) },
    picker: { open: () => assert.fail('picker must stay closed') },
    targets: { resolve: () => device },
    getAdbPath: () => 'adb.exe',
    save: () => {},
    render: () => {},
    log: message => failedLogs.push(message)
  });
  await failed.open({ id: 'failed', name: '失败动作' }, { capture: true });
  assert.equal(failedLogs[0], '截屏失败：permission denied');

  // ---- 截图存档（v1.20.0）：截屏即存档、重启后（无内存 _shot）打开自动恢复、存档未命中回落重新截屏 ----
  const stored = {};
  let savedName = null;
  const archived = createAdbScreenshotController({
    executor: {
      exec() { calls.push('archived-exec'); return Promise.resolve({ ok: true, b64: 'y'.repeat(150) }); }
    },
    picker: { open: target => picks.push('archived:' + target.id) },
    targets: { resolve: () => device },
    getAdbPath: () => 'adb.exe',
    save: () => {},
    render: () => {},
    log: () => {},
    shotStore: {
      save(name, b64) { savedName = name; stored[name] = b64; return { ok: true }; },
      async load(name) { return name in stored ? { ok: true, b64: stored[name] } : { ok: false, error: 'none' }; }
    }
  });
  const fresh = { id: 'shot-9', name: '存档动作', x: 100, y: 200 };
  await archived.open(fresh, { capture: true, show: false });
  assert.equal(savedName, 'shot-9');                       // 截屏成功即自动存档
  assert.equal(stored['shot-9'].length, 150);
  const reopened = { id: 'shot-9', name: '存档动作', x: 100, y: 200 };   // 模拟重启：内存 _shot 已失
  await archived.open(reopened, { show: true });
  assert.equal(reopened._shot.length, 150);                // 从存档恢复当时的截图
  assert.deepEqual(picks.slice(-1), ['archived:shot-9']);  // 直接打开浮层，未重新截屏
  assert.equal(calls.filter(c => c === 'archived-exec').length, 1);   // 恢复路径零 exec
  const missed = { id: 'shot-404', name: '无存档', x: 1, y: 2 };
  await archived.open(missed, { capture: false, show: false });         // 存档未命中 → 回落重新截屏
  assert.equal(missed._shot.length, 150);

  console.log('adb-screenshot-controller contract: 31 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
