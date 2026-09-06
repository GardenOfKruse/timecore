/* 到点瞬间主线程响应探测：轮询 eval 往返时间，跨越 ZERO 边界观察是否卡顿 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-zeroprobe');
const PORT = 9229;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    const t0 = Date.now();
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    const check = () => {
      if (!pending.has(id)) return;
      if (Date.now() - t0 > 15000) { pending.delete(id); reject(new Error('timeout')); return; }
      setTimeout(check, 50);
    };
    check();
  }).then(r => r.result && r.result.value);
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
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
await js('!!window.TC');
await sleep(800);
await js(`document.getElementById('wl-skip').click()`);

await js(`document.querySelector('.chip-btn[data-sec="10"]').click()`);
// 每 100ms 探测一次往返耗时，跨越 ZERO 边界
const rows = [];
const t0 = Date.now();
while (Date.now() - t0 < 14000) {
  let rtt = -1, ph = '?';
  try {
    const a = Date.now();
    const v = await js(`(document.body.dataset.phase || 'IDLE') + '|' + Math.round(TC.Countdown.info().remainingMs)`);
    rtt = Date.now() - a;
    ph = v;
  } catch (e) { rtt = 99999; }
  rows.push({ t: Date.now() - t0, rtt, ph });
  await sleep(100 - (rtt > 100 ? 0 : rtt));
}
let lastPh = '';
for (const r of rows) {
  const ph = r.ph.split('|')[0];
  if (ph !== lastPh || r.rtt > 300) {
    console.log(`t=${String(r.t).padStart(5)}ms rtt=${String(r.rtt).padStart(6)}ms phase=${r.ph}`);
    lastPh = ph;
  }
}
const maxRtt = Math.max(...rows.map(r => r.rtt));
console.log('MAX_RTT=' + maxRtt + 'ms  (基线 ~10-40ms；>500ms 即主线程明显卡顿)');
try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1200);
try { child.kill(); } catch (_) {}
process.exit(0);
