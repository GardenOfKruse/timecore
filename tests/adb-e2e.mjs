/* ADB 齐射 E2E 驱动：通过 CDP 连接 Electron 渲染进程，驱动真实 adb 验证
 * 用法：TC_TMP_PROFILE 隔离 profile；先启动 electron --remote-debugging-port=9223，再 node tests/adb-e2e.mjs
 * 只执行只读命令（date/getprop/echo/screencap），不触碰手机屏幕 */
import { writeFileSync } from 'node:fs';

const PORT = 9223;
let seq = 0;
const pending = new Map();

function evalInPage(ws, expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout: ' + expr.slice(0, 60))); }
    }, 30000);
  });
}

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('index.html'));
if (!page) { console.error('找不到应用页面:', targets.map(t => t.url)); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else if (m.result && m.result.exceptionDetails) reject(new Error('页面异常: ' + JSON.stringify(m.result.exceptionDetails).slice(0, 300)));
    else resolve(m.result);
  }
};

function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout: ' + method)); } }, 30000);
  });
}
async function cdpJson(expr) {
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result ? r.result.value : undefined;
}

async function step(name, expr) {
  const r = await cdpJson(expr);
  console.log('== ' + name + ' ==\n' + (typeof r === 'string' ? r : JSON.stringify(r)));
  return r;
}

await step('环境', `JSON.stringify({ electron: !!window.electronAPI, adb: !!TC.ADB })`);

// BUG1 回归：全屏往返，状态与窗口尺寸都必须恢复
await step('全屏往返', `(async () => {
  const w0 = outerWidth, h0 = outerHeight;
  electronAPI.send('fullscreen');
  await new Promise(r => setTimeout(r, 800));
  const s1 = { fs: (await electronAPI.get()).fs, w: outerWidth };
  electronAPI.send('fullscreen');
  await new Promise(r => setTimeout(r, 800));
  const s2 = { fs: (await electronAPI.get()).fs, w: outerWidth, restored: outerWidth === w0 && outerHeight === h0 };
  return JSON.stringify({ w0, h0, s1, s2 });
})()`);

const detect = await step('adb 检测', `TC.ADB.detect().then(r => JSON.stringify(r))`);
if (!detect || !JSON.parse(detect).ok) { console.error('adb 检测失败，终止'); process.exit(1); }

await step('设备扫描', `TC.ADB.scan().then(() => JSON.stringify(TC.ADB.debug().devices.map(d => ({ serial: d.serial, name: d.name, state: d.state, L: d.L, W: d.W, H: d.H }))))`);

// 即时重排：倒计时进行中勾选/停用动作，布防路数应即时变化（真实 UI 路径）
await step('即时重排', `(async () => {
  TC.ADB.dry(true);
  TC.Countdown.startSingle(TC.time.epoch() + 12000);
  await new Promise(r => setTimeout(r, 500));
  const card = document.querySelector('.adb-action');
  const onBox = card.querySelector('.a-on');
  onBox.click();                                   // 启用 → save → 去抖重排
  await new Promise(r => setTimeout(r, 500));
  const pOn = TC.ADB.debug().pending;
  onBox.click();                                   // 停用 → 重排清空
  await new Promise(r => setTimeout(r, 500));
  const pOff = TC.ADB.debug().pending;
  onBox.click();                                   // 再启用
  await new Promise(r => setTimeout(r, 500));
  const pOn2 = TC.ADB.debug().pending;
  TC.Countdown.stop();
  return JSON.stringify({ pOn, pOff, pOn2 });
})()`);


// 截图选点链路：exec-out screencap 二进制 → base64 PNG + 实际 pickPoint 走通
await step('截图选点', `(async () => {
  const dbg = TC.ADB.debug();
  const d = dbg.devices.find(x => x.state === 'device');
  if (!d) return '无在线设备';
  const r = await electronAPI.adb('exec', { path: dbg.adbPath, args: ['-s', d.serial, 'exec-out', 'screencap', '-p'], timeoutMs: 15000, binary: true });
  const kb = Math.round((r.b64 || '').length * 3 / 4 / 1024);
  const pick = { id: 'pick1', type: 'tap', name: '选点验证', x: '', y: '', n: 3, gap: 400, lead: '', devs: [], on: false };
  dbg.cfg.actions.push(pick);
  await TC.ADB.pickPoint(pick);
  return JSON.stringify({ ok: r.ok, isPng: (r.b64 || '').startsWith('iVBOR'), kb, shotKB: Math.round((pick._shot || '').length * 3 / 4 / 1024), shotWH: pick.shotW + 'x' + pick.shotH, pickXY: pick.x + ',' + pick.y });
})()`);

// 模板演练布防（连点模板 × 在线设备）
await step('演练布防(节点+5s)', `(async () => {
  TC.ADB.dry(true);
  const dbg = TC.ADB.debug();
  dbg.cfg.actions = [{ id: 't1', type: 'tap', name: '连点测试', x: 990, y: 2200, n: 4, gap: 400, lead: '', devs: [], on: true }];
  const node = TC.time.epoch() + 5000;
  TC.ADB.arm(node);
  const pending = TC.ADB.debug().pending;
  await new Promise(r => setTimeout(r, 6200));
  return JSON.stringify({ pending, logs: TC.ADB.debug().logs.slice(0, 5) });
})()`);

// 真实执行（只读 getprop）验证引擎→设备链路
await step('真实执行 getprop', `(async () => {
  TC.ADB.dry(false);
  const dbg = TC.ADB.debug();
  dbg.cfg.actions[0].type = 'adv';
  dbg.cfg.actions[0].script = 'getprop ro.product.model';
  TC.ADB.testFire(dbg.cfg.actions[0]);
  await new Promise(r => setTimeout(r, 2000));
  return JSON.stringify(TC.ADB.debug().logs.slice(0, 2));
})()`);

// 改名持久化：走真实存储路径（cfg.devices + 保存）→ 重扫核对
await step('改名并保存', `(async () => {
  const dbg = TC.ADB.debug();
  const d = dbg.devices[0];
  dbg.cfg.devices[d.serial].name = '测试机甲一号';
  await TC.ADB.scan();
  const saved = JSON.parse(localStorage.getItem('tc.adb.v1')).devices[d.serial];
  const nowName = TC.ADB.debug().devices.find(x => x.serial === d.serial).name;
  return JSON.stringify({ serial: d.serial, savedName: saved.name, scanName: nowName });
})()`);

// 添加操作：默认连点 + 切换类型
await step('添加操作流程', `(async () => {
  const before = TC.ADB.debug().cfg.actions.length;
  const sel = document.getElementById('adb-add-type');
  sel.value = 'tap';
  document.getElementById('adb-add').click();
  const tapAdded = TC.ADB.debug().cfg.actions.length === before + 1;
  const lastTap = TC.ADB.debug().cfg.actions.at(-1);
  sel.value = 'wake';
  document.getElementById('adb-add').click();
  const lastWake = TC.ADB.debug().cfg.actions.at(-1);
  return JSON.stringify({ tapAdded, lastType: lastTap.type, defaultN: lastTap.n, wakeType: lastWake.type });
})()`);

// 总开关：停用后布防无效；重新启用恢复
await step('ADB 总开关', `(async () => {
  const def = TC.ADB.debug().cfg.enabled;
  TC.ADB.setEnabled(false);
  TC.ADB.arm(TC.time.epoch() + 5000);
  const pendingOff = TC.ADB.debug().pending;
  TC.ADB.setEnabled(true);
  await new Promise(r => setTimeout(r, 600));
  const after = TC.ADB.debug();
  return JSON.stringify({ def, pendingOff, reEnabled: after.cfg.enabled, devices: after.devices.length });
})()`);

// 打开抽屉 + 置前截图
await step('打开抽屉', `(async () => { document.getElementById('btn-adb').click(); await new Promise(r => setTimeout(r, 500)); return 'ok'; })()`);

// BUG2 回归：大图选点浮层——真实受信鼠标点击 + 等比断言 + 放大镜
await step('大图选点浮层', `(async () => {
  const dbg = TC.ADB.debug();
  const a = dbg.cfg.actions.find(x => x.type === 'tap');
  if (!a) return '无 tap 动作';
  await TC.ADB.pickPoint(a);
  TC.ADB.openPicker(a);
  await new Promise(r => setTimeout(r, 300));
  const img = document.getElementById('sp-img');
  const r = img.getBoundingClientRect();
  const arImg = +(r.width / r.height).toFixed(3);
  const arShot = +(a.shotW / a.shotH).toFixed(3);
  const noDistort = Math.abs(arImg - arShot) < 0.01;
  return JSON.stringify({ visible: !document.getElementById('shot-picker').hidden, arImg, arShot, noDistort, probe: { x: Math.round(r.left + r.width * 0.72), y: Math.round(r.top + r.height * 0.24) } });
})()`);

// 真实受信鼠标：移动(放大镜) + 按下/抬起(选中)
const probe = await cdpJson(`(() => { const r = document.getElementById('sp-img').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.72), y: Math.round(r.top + r.height * 0.24) }; })()`);
await call('Page.bringToFront', {});
await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: probe.x, y: probe.y });
await new Promise(r => setTimeout(r, 300));
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
await new Promise(r => setTimeout(r, 300));
await step('受信点击选点', `(async () => {
  const a = TC.ADB.debug().cfg.actions.find(x => x.type === 'tap');
  const img = document.getElementById('sp-img');
  const r = img.getBoundingClientRect();
  return JSON.stringify({
    xy: a.x + ',' + a.y,
    expectXY: Math.round(0.72 * a.shotW) + ',' + Math.round(0.24 * a.shotH),
    magShown: document.getElementById('sp-mag').style.display === 'block',
    crossLeftPct: document.getElementById('sp-cross').style.left
  });
})()`);

await call('Page.bringToFront', {});
await new Promise(r => setTimeout(r, 600));
const magMove = await cdpJson(`(() => {
  const img = document.getElementById('sp-img');
  const r = img.getBoundingClientRect();
  return { x: Math.round(r.left + r.width * 0.72), y: Math.round(r.top + r.height * 0.24), w: r.width, h: r.height };
})()`);
await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: magMove.x, y: magMove.y });
await new Promise(r => setTimeout(r, 400));
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync(new URL('../docs/adb-e2e.png', import.meta.url), Buffer.from(shot.data, 'base64'));
console.log('== 截图 == docs/adb-e2e.png');
ws.close();
process.exit(0);
