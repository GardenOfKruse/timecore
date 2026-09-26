/* 循环#34 E2E：局域网伴侣页 —— 开关链路 / HTTP /state /events SSE / 端口冲突 / 白名单投影 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c34-profile');
const PORT = 9273;
const COMP_BASE = 8399;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout')); } }, 20000);
  }).then(r => {
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 120));
    return r.result && r.result.value;
  });
}
async function waitJs(expr, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await js(expr)) return true; await sleep(150); }
  return false;
}
function get(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', err => resolve({ error: err.code }));
    req.setTimeout(4000, () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}
// 读 SSE 流的前 n 条 data 帧
function readSse(url, want, ms) {
  return new Promise(resolve => {
    const frames = [];
    const req = http.get(url, res => {
      let buf = '';
      res.on('data', c => {
        buf += c;
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) frames.push(line.slice(6));
            if (frames.length >= want) { req.destroy(); resolve(frames); return; }
          }
        }
      });
      res.on('error', () => resolve(frames));
    });
    req.on('error', () => resolve(frames));
    setTimeout(() => { req.destroy(); resolve(frames); }, ms);
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
if (!page) { console.error('主窗口未就绪'); process.exit(1); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
await js('!!window.TC');
await sleep(900);
await js(`document.getElementById('wl-skip').click()`).catch(() => {});
await sleep(500);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};

// A: 默认关——基址端口拒连
const closed = await get(`http://127.0.0.1:${COMP_BASE}/state`);
check('伴侣页默认关闭', closed.error !== undefined, closed);

// B: UI 开关开启 → 服务器起在 8399
await js(`document.getElementById('set-companion').checked = true; document.getElementById('set-companion').dispatchEvent(new Event('change'))`);
await waitJs(`(async () => { const st = await electronAPI.get(); return st.companion && st.companion.on; })()`, 6000);
const winInfo = JSON.parse(await js(`(async () => { const st = await electronAPI.get(); return JSON.stringify(st.companion); })()`));
check('开关开启：服务器监听 8399 + 真值回读', winInfo.on === true && winInfo.port === COMP_BASE, winInfo);

// C: 首页与 /state 可用
const pageHtml = await get(`http://127.0.0.1:${COMP_BASE}/`);
check('伴侣页首页可用', pageHtml.status === 200 && pageHtml.body.includes('TIMECORE 伴侣'), { status: pageHtml.status });

// D: 布防后 /state 递减（实时性：间隔两次采样必然下降）
await js(`TC.Countdown.startSingle(TC.time.epoch() + 30000)`);
await sleep(700);
const d1 = JSON.parse((await get(`http://127.0.0.1:${COMP_BASE}/state`)).body);
await sleep(700);
const d2 = JSON.parse((await get(`http://127.0.0.1:${COMP_BASE}/state`)).body);
check('/state 实时递减 + 布防态', d1.armed === true && d1.remainingMs > d2.remainingMs && d2.remainingMs > 0, { d1: d1.remainingMs, d2: d2.remainingMs });

// E: /state 白名单投影（无 adb/cfg/统计等键）
const ALLOWED = new Set(['armed', 'phase', 'remainingMs', 'target', 'periodMs', 'cycleIndex', 'cycles', 'infinite', 'fired', 'hasNext', 'epoch']);
const leaked = Object.keys(d2).filter(k => !ALLOWED.has(k));
check('/state 白名单投影零泄漏', leaked.length === 0, leaked);

// F: SSE 流至少收到 1 帧
const frames = await readSse(`http://127.0.0.1:${COMP_BASE}/events`, 2, 4000);
let sseOk = frames.length >= 1;
try { sseOk = sseOk && JSON.parse(frames[0]).armed === true; } catch (_) { sseOk = false; }
check('SSE 流推送状态帧', sseOk, { frames: frames.length });

// G: 端口冲突 → 落到 8400（占用 8399 后关-开循环）
await js(`document.getElementById('set-companion').checked = false; document.getElementById('set-companion').dispatchEvent(new Event('change'))`);
await waitJs(`(async () => { const st = await electronAPI.get(); return st.companion && !st.companion.on; })()`, 6000);
const blocker = http.createServer();
await new Promise(r => blocker.listen(COMP_BASE, '0.0.0.0', r));
await js(`document.getElementById('set-companion').checked = true; document.getElementById('set-companion').dispatchEvent(new Event('change'))`);
await waitJs(`(async () => { const st = await electronAPI.get(); return st.companion && st.companion.on; })()`, 8000);
const winInfo2 = JSON.parse(await js(`(async () => { const st = await electronAPI.get(); return JSON.stringify(st.companion); })()`));
check('端口冲突：自动落到 8400', winInfo2.on === true && winInfo2.port === COMP_BASE + 1, winInfo2);
blocker.close();
await js(`document.getElementById('set-companion').checked = false; document.getElementById('set-companion').dispatchEvent(new Event('change'))`);
await waitJs(`(async () => { const st = await electronAPI.get(); return st.companion && !st.companion.on; })()`, 6000);

// H: 关闭后拒连
const closed2 = await get(`http://127.0.0.1:${COMP_BASE}/state`);
check('关闭后拒连', closed2.error !== undefined, closed2);

await js(`TC.Countdown.stop()`).catch(() => {});
await js(`electronAPI.send('close')`).catch(() => {});
const okN = results.filter(Boolean).length;
console.log(`\n==== 循环#34 局域网伴侣：${okN}/${results.length} 通过 ====`);
process.exit(okN === results.length ? 0 : 1);
