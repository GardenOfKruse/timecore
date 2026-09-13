/* 循环#30 E2E：六种窗口模式 / 悬浮钟窗口 / 驻留下一轮预告 / 音频批量与全程节拍 / ADB 默认提前量 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c30-profile');
const PORT = 9237;
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
    page = targets.find(t => t.type === 'page' && t.url.includes('index.html') && !t.url.includes('overlay=1')) || null;
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

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};

// E: ADB 默认提前量 100（新 profile）
check('ADB 默认提前量 100', (await js(`TC.ADB.debug().cfg.leadMs`)) === 100);

// D: 六模式——尺寸预设与密度
for (const [preset, wmin, wmax, mini, compact] of [
  ['small', 470, 490, false, true], ['phone', 370, 390, true, true],
  ['narrow', 550, 570, false, true], ['wide', 1270, 1290, false, false], ['standard', 1170, 1190, false, false]]) {
  await js(`electronAPI.send('size', { preset: '${preset}' })`);
  const ok = await waitJs(`innerWidth >= ${wmin} && innerWidth <= ${wmax} && document.body.classList.contains('mini') === ${mini} && document.body.classList.contains('compact') === ${compact}`);
  check(`尺寸 ${preset} + 密度`, ok, await js(`innerWidth`));
}
await js(`electronAPI.send('size', { preset: 'standard' })`);
await sleep(600);

// C: 悬浮钟窗口——打开/状态/穿透/关闭 + 位置记忆
await js(`electronAPI.send('overlay', { action: 'toggle' })`);
await waitJs(`electronAPI.get().then(st => st.overlay === true)`);
await sleep(1200);   // 等悬浮窗加载
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ovPage = targets.find(t => t.url.includes('overlay=1'));
check('悬浮钟窗口已创建', !!ovPage, (targets.map(t => t.url.split('/').pop())));
let ovClock = null;
if (ovPage) {
  const oseq = { n: 0 };
  const ows = new WebSocket(ovPage.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ows.onopen = res; ows.onerror = rej; });
  ows.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
  };
  const ojs = expr => new Promise((resolve, reject) => {
    const id = ++oseq.n;
    pending.set(id, { resolve, reject });
    ows.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('ov timeout')); } }, 8000);
  }).then(r => r.result && r.result.value);
  await sleep(700);
  ovClock = await ojs(`(() => {
    const cd = document.getElementById('clock-hms'), ms = document.getElementById('clock-ms');
    return JSON.stringify({ bodyOv: document.body.classList.contains('overlay'),
      hms: /\\d{2}:\\d{2}:\\d{2}/.test(cd ? cd.textContent : ''),
      ms3: /^\\.\\d{3}$/.test(ms ? ms.textContent : ''),
      hidden3d: getComputedStyle(document.getElementById('scene')).display === 'none' });
  })()`);
  const oc = JSON.parse(ovClock);
  check('悬浮钟：时钟跳动毫秒 3 位', oc.hms && oc.ms3, oc);
  check('悬浮钟：无 3D 场景', oc.hidden3d, oc);
  // 穿透切换
  await ojs(`document.getElementById('ov-ct').click()`);
  await sleep(500);
  const ct = JSON.parse(await js(`(async () => JSON.stringify(await electronAPI.get()))()`));
  check('悬浮钟：点击穿透可切换', ct.overlayCt === true, ct);
  await ows.close();
}
await js(`electronAPI.send('overlay', { action: 'toggle' })`);
await waitJs(`electronAPI.get().then(st => st.overlay === false)`);
check('悬浮钟：可关闭', true);
const ovFile = path.join(PROFILE, 'tc-overlay.json');
check('悬浮钟：位置/穿透已持久化', existsSync(ovFile) && (() => { try { const j = JSON.parse(readFileSync(ovFile, 'utf8')); return j.ct === true && isFinite(j.x); } catch (_) { return false; } })(), existsSync(ovFile));

// B: 驻留期下一轮预告（10s 对齐 → 零点后 fired && hasNext；轮询预告文本本身）
await js(`TC.Countdown.startAligned(10000, 3, false)`);
const prevOk = await waitJs(`document.getElementById('cd-target').textContent.includes('下一轮')`, 15000);
const prev = await js(`document.getElementById('cd-target').textContent`);
check('驻留期显示下一轮预告', prevOk && prev.includes('开始'), prev);
await js(`TC.Countdown.stop()`);

// A: 音频——批量预排机制 + fire key 登记 + Worker + 全程节拍
await js(`TC.Audio.unlock()`);
await waitJs(`TC.Audio.info().state === 'running'`);
const info0 = JSON.parse(await js(`JSON.stringify(TC.Audio.info())`));
check('音频 Worker 唤醒已建立', info0.worker === true, info0.worker);
check('全程节拍默认开', info0.metroFull === true);
await js(`TC.Countdown.startSingle(TC.time.epoch() + 12000)`);   // 12s 单次：留出批量空间
await js(`TC.Audio.debugSched(13000)`);                          // 以 13s 预排窗口跑一次调度器（模拟后台批量路径）
const info1 = JSON.parse(await js(`JSON.stringify(TC.Audio.info())`));
check('批量预排（scheduled≥11）', info1.scheduled >= 11, info1.scheduled);
check('fire key 已登记（零点兜底不会二次补放）', info1.hasFireKey === true, info1.hasFireKey);
await js(`TC.Countdown.stop()`);
const afterStop = JSON.parse(await js(`JSON.stringify(TC.Audio.info())`));
check('停止后撤销排音（queued≤2）', afterStop.queued <= 2 && afterStop.scheduled === 0, afterStop);

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#30 六模式/悬浮钟/音频批量：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
