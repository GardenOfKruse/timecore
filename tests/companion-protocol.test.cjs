const assert = require('node:assert/strict');

require('../js/generated/companion-protocol.js');
const { createCompanionProtocol } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const p = createCompanionProtocol();

  // 命令路由：set-enabled 仅显式 true 开启
  ok(p.routeCommand('set-enabled', true) !== null && p.routeCommand('set-enabled', true).enabled === true);
  ok(p.routeCommand('set-enabled', false).enabled === false);
  ok(p.routeCommand('set-enabled', 'yes').enabled === false);

  // push-state：白名单投影
  const state = { armed: true, phase: 'NORMAL', remainingMs: 12345, target: 1, periodMs: 30000, cycleIndex: 2, cycles: 0, infinite: true, fired: false, hasNext: true, epoch: 1789, adbPath: 'C:\\secret', devices: [{ serial: 'x' }], cfg: { a: 1 }, logs: ['log'] };
  const cmd = p.routeCommand('push-state', state);
  ok(cmd !== null && cmd.type === 'push-state');
  const proj = cmd.state;
  ok(proj.armed === true && proj.phase === 'NORMAL' && proj.remainingMs === 12345 && proj.epoch === 1789);
  ok(!('adbPath' in proj) && !('devices' in proj) && !('cfg' in proj) && !('logs' in proj));
  ok(Object.keys(proj).length === 11);

  // 未知命令/非对象 arg 拒收
  ok(p.routeCommand('shell') === null);
  ok(p.routeCommand(null) === null);
  ok(p.routeCommand('push-state', 'not-object') === null);

  // projectState 独立可用：非法入参返回空对象
  ok(Object.keys(p.projectState(null)).length === 0);
  ok(Object.keys(p.projectState('x')).length === 0);

  // 值为对象的字段不投影（防嵌套泄漏）
  const nested = p.projectState({ armed: true, nested: { deep: 1 }, arr: [1] });
  ok(nested.armed === true && !('nested' in nested) && !('arr' in nested));

  console.log(`companion-protocol contract: ${n} assertions passed`);
})();
