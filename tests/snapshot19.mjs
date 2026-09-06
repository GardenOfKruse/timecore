/* 循环#19 形态留档：迷你/紧凑窗口 + ADB 引导卡截图（隔离 profile） */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c19-shot');
const PORT = 9227;

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
  }).then(r => r.result && r.result.value);
}
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout')); } }, 10000);
  });
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
// 关闭欢迎卡（新 profile 必出现），再拍各窗口形态
await js(`document.getElementById('wl-skip').click()`);
await sleep(300);
if (!(await js(`document.getElementById('welcome').hidden`))) { console.error('欢迎卡未能关闭'); process.exit(1); }

async function snap(preset, name, extra) {
  await js(`electronAPI.send('size', { preset: '${preset}' })`);
  await sleep(900);
  if (extra) await js(extra);
  await sleep(400);
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(ROOT, 'docs', name), Buffer.from(shot.data, 'base64'));
  console.log('== ' + name + ' @' + (await js('innerWidth + "x" + innerHeight')));
}

await snap('mini', 'size-mini.png');
await snap('compact', 'size-compact.png');
await snap('standard', 'adb-guide.png', `document.getElementById('btn-adb').click()`);
await sleep(400);
const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync(path.join(ROOT, 'docs', 'adb-guide.png'), Buffer.from(shot.data, 'base64'));

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}
process.exit(0);
