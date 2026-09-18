/* 循环#31 E2E：真实太阳 / 星野流星 / 卫星尾迹 / 钟面秒环 / 零点脉动 / 钟面缩放记忆 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c31-profile');
rmSync(path.join(PROFILE, 'tc-clock.json'), { force: true });   // 清缩放记忆，保证起测宽度确定
const PORT = 9263;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout')); } }, 15000);
  }).then(r => {
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 150));
    return r.result && r.result.value;
  });
}
async function waitJs(expr, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await js(expr)) return true; await sleep(150); }
  return false;
}

const child = spawn(ELECTRON, [ROOT, '--remote-debugging-port=' + PORT], {
  cwd: ROOT, env: { ...process.env, TC_TMP_PROFILE: PROFILE }, stdio: 'ignore'
});
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    page = targets.find(t => t.type === 'page' && t.url.includes('index.html')) || null;
  } catch (_) {}
  if (!page) await sleep(500);
}
if (!page) { console.error('主窗口未就绪'); process.exit(1); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
await js('!!window.TC');
await sleep(800);
await js(`document.getElementById('wl-skip').click()`);
await sleep(600);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};

// A: 场景基础——星野可见、双卫星尾迹、太阳未被覆盖
const d0 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('星野可见 + 双尾迹 + 无覆盖', d0.stars === true && d0.trails === 2 && d0.override === null, d0);

// B: 真实太阳——?sunhour 覆盖改变方位与强度（正午正面亮 / 午夜背面+月光）
await js(`location.href = location.pathname + '?sunhour=12'`);
await sleep(2400);
try { await js(`document.getElementById('wl-skip').click()`); } catch (_) {}
await sleep(1200);
const noon = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('正午：太阳正面 + 明亮', noon.override === 12 && noon.pos[2] > 5 && noon.intensity > 0.4, noon);
await js(`location.href = location.pathname + '?sunhour=0'`);
await sleep(2400);
try { await js(`document.getElementById('wl-skip').click()`); } catch (_) {}
await sleep(1200);
const midnight = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('午夜：太阳背面 + 月光补光', midnight.override === 0 && midnight.pos[2] < -5 && midnight.moon > 0.4, midnight);
await js(`location.href = location.pathname`);
await sleep(2400);
try { await js(`document.getElementById('wl-skip').click()`); } catch (_) {}
await sleep(800);

// C: 流星——强制触发后短暂活跃然后结束
await js(`TC.Scene.meteor()`);
const mAct = await waitJs(`TC.Scene.debugSun().meteorActive === true`, 1500);
const mEnd = await waitJs(`TC.Scene.debugSun().meteorActive === false`, 2500);
check('流星：强制触发 → 0.9s 后结束', mAct && mEnd, { mAct, mEnd });

// C2: 场景交互——横向拖拽改变相机方位，且拖拽结束不残留拖动态
const viewDrag = JSON.parse(await js(`(() => {
  const c = document.getElementById('scene');
  const before = TC.Scene.debugView();
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, button: 0, clientX: 400, clientY: 300 }));
  c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, buttons: 1, clientX: 520, clientY: 300 }));
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31, button: 0, clientX: 520, clientY: 300 }));
  const after = TC.Scene.debugView();
  return JSON.stringify({ before, after, changed: Math.abs(after.targetYaw - before.targetYaw) > 0.5 });
})()`));
check('星球横向拖拽：相机方位可环绕 360°', viewDrag.changed && viewDrag.after.canvas === true && viewDrag.after.dragging === false, viewDrag);

// D: 钟面秒环——存在、随毫秒推进
await js(`electronAPI.send('size', { preset: 'clock' })`);
await waitJs(`document.body.classList.contains('clockmode')`);
await sleep(700);
const ring = JSON.parse(await js(`(async () => {
  const rect = document.querySelector('.sec-ring rect');
  if (!rect) return JSON.stringify({ exists: false });
  const a = rect.style.strokeDashoffset;
  await new Promise(r2 => setTimeout(r2, 350));
  return JSON.stringify({ exists: true, a, b: rect.style.strokeDashoffset, moved: a !== rect.style.strokeDashoffset });
})()`));
check('秒环：存在且随毫秒推进', ring.exists && ring.moved, ring);

// E: 零点脉动——钟面形态下归零触发 zero-pulse（bus 收据 + 面板类双重取证）
const zp = await js(`(async () => {
  window.__z31 = { bus: false, cls: false, armedStyle: false };
  TC.bus.on('cd:zero', () => { window.__z31.bus = true; if (document.body.classList.contains('clockmode')) {
    const p2 = document.querySelector('.clock-panel');
    if (p2) window.__z31.cls = true;
  } });
  electronAPI.send('size', { preset: 'clock' });
  await new Promise(r2 => setTimeout(r2, 800));
  TC.Countdown.startSingle(TC.time.epoch() + 4000);   // 绝对目标 4s 后：确保归零发生在重进钟面之后
  await new Promise(r2 => setTimeout(r2, 700));
  window.__z31.armedStyle = document.querySelector('.clock-panel').classList.contains('clock-armed');
  electronAPI.send('size', { preset: 'clock' });
  await new Promise(r2 => setTimeout(r2, 600));
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (document.querySelector('.clock-panel').classList.contains('zero-pulse')) window.__z31.cls = true;
    if (window.__z31.bus && window.__z31.cls) break;
    await new Promise(r3 => setTimeout(r3, 40));
  }
  return JSON.stringify(window.__z31);
})()`);
check('零点脉动：cd:zero 触发且钟面布防态生效', JSON.parse(zp).bus === true && JSON.parse(zp).cls === true && JSON.parse(zp).armedStyle === true, zp);

// F: 钟面缩放记忆——放大后退出再进入保持宽度（先确保从主窗口开始）
if (await js(`document.body.classList.contains('clockmode')`)) {
  await js(`electronAPI.send('size', { preset: 'clock' })`);
  await waitJs(`!document.body.classList.contains('clockmode')`);
}
await sleep(500);
await js(`electronAPI.send('size', { preset: 'clock' })`);
await waitJs(`document.body.classList.contains('clockmode')`);
await sleep(600);
const dragBaseW = await js(`innerWidth`);
await js(`electronAPI.send('move-begin'); electronAPI.send('clock-zoom', -1)`);
await sleep(220);
const dragGuardW = await js(`innerWidth`);
await js(`electronAPI.send('move-end')`);
check('拖拽期间误发 wheel 不触发缩放', dragGuardW === dragBaseW, { dragBaseW, dragGuardW });
await js(`electronAPI.send('clock-zoom', -1)`);
await waitJs(`innerWidth > 300 && innerWidth < 320`);
const w1 = await js(`innerWidth`);
await js(`electronAPI.send('size', { preset: 'clock' })`);   // 退出
await waitJs(`!document.body.classList.contains('clockmode')`);
await sleep(500);
await js(`electronAPI.send('size', { preset: 'clock' })`);   // 再次进入
const memOk = await waitJs(`Math.abs(innerWidth - ${w1}) <= 2`, 4000);
check('缩放记忆：再进钟面恢复上次宽度', memOk, { w1, w: await js('innerWidth') });
await js(`electronAPI.send('size', { preset: 'clock' })`);   // 退出收尾
await waitJs(`!document.body.classList.contains('clockmode')`);

// G: 钟面零渲染——clockmode 下整帧 GPU 跳过，退出恢复
await js(`electronAPI.send('size', { preset: 'clock' })`);
await waitJs(`document.body.classList.contains('clockmode')`);
await sleep(600);
const s1 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
await js(`electronAPI.send('size', { preset: 'clock' })`);   // 退出
const s2 = await waitJs(`TC.Scene.debugSun().skipStreak === 0`, 3000);
check('钟面零渲染：跳帧连续增长，退出归零', s1.skipStreak >= 5 && s2, { skipStreak: s1.skipStreak });

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#31 太阳/星空/尾迹/秒环/脉动/记忆：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
