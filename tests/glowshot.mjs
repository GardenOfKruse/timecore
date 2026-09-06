/* 辉光配额对比抓拍：同一脚本跑「现状版/配额版」各一遍，输出五态截图
 * 用法：GLOW_OUT=docs/glow-preview/before node tests/glowshot.mjs（TC_TMP_PROFILE 隔离） */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, process.env.GLOW_OUT || 'docs/glow-preview/tmp');
const PROFILE = path.join(os.tmpdir(), 'tc-glowshot-' + (process.env.GLOW_TAG || 'x'));
const PORT = 9228;
mkdirSync(OUT, { recursive: true });

let seq = 0;
const pending = new Map();
let ws = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); } }, 10000);
  }).then(r => { if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 150)); return r.result && r.result.value; });
}
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout')); } }, 10000);
  });
}
async function snap(name) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'));
      console.log('== ' + name + ' @' + (await js('innerWidth + "x" + innerHeight')));
      return;
    } catch (e) {
      console.log('   snap retry ' + (attempt + 1) + ' (' + e.message.slice(0, 40) + ')');
      await sleep(1200);
    }
  }
  console.log('== ' + name + ' FAILED');
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
if (!page) { console.error('应用未就绪'); process.exit(1); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
await js('!!window.TC');
await sleep(800);
await js(`document.getElementById('wl-skip').click()`);
await sleep(400);

// 0) 紧凑待机（放在最前：到点特效后渲染端偶发截屏超时）
await js(`electronAPI.send('size', { preset: 'compact' })`);
await sleep(900);
await snap('5-compact-idle.png');
await js(`electronAPI.send('size', { preset: 'standard' })`);
await sleep(900);

// 1) 标准待机：时钟 + 星球 + 倒计时面板
await snap('1-std-idle.png');

// 2) 阶段运行：10s 对齐，等到 WARMUP/SURGE 阶段（面板边框着色 + 数字辉光）
await js(`document.querySelector('.chip-btn[data-sec="10"]').click()`);
const t0 = Date.now();
let ph = 'IDLE';
while (Date.now() - t0 < 12000) {
  ph = await js(`document.body.dataset.phase || 'IDLE'`);
  if (ph === 'SURGE' || ph === 'PULSE') break;   // 固定捕捉中后段相位，前后版本可比
  await sleep(60);
}
await sleep(200);
console.log('   phase=' + ph);
await snap('2-std-phase.png');

// 3) 击拍反馈：连击 3 次 PERFECT → judge 弹出 + combo 面板（趁动画可见窗口内拍）
for (let i = 0; i < 3; i++) await js(`TC.Beats.hit(TC.time.epoch())`);
await sleep(180);
await snap('3-std-judge.png');

// 4) 到点瞬间：轮询到 ZERO 相位立即拍（白闪 + 释放大字）
const t1 = Date.now();
while (Date.now() - t1 < 12000) {
  const z = await js(`document.body.dataset.phase === 'ZERO'`);
  if (z) break;
  await sleep(30);
}
await snap('4-std-zero.png');
await js(`TC.Countdown.stop()`);
await sleep(600);

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}
process.exit(0);
