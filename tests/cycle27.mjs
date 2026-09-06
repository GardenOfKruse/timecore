/* 循环#27 E2E：连点脚本优化——末尾不空睡 + 间隔补偿（语义：间隔≈实际点击间隔） */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c27-profile');
const PORT = 9234;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout')); } }, 15000);
  }).then(r => {
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 150));
    return r.result && r.result.value;
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
await js(`document.getElementById('wl-skip').click()`);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};

await js(`TC.ADB.setEnabled(true)`);
await sleep(1000);
await js(`TC.ADB._dev('tc-dev-1', 150)`);   // 模拟设备：点击开销 150ms

// 间隔补偿默认开：16次/500ms → sleep = 500-150 = 350ms，且末次迭代无 sleep
const s1 = await js(`TC.ADB.genScript({ type: 'tap', name: 't', x: 5, y: 5, n: 16, gap: 500, lead: '', devs: [] }, 'tc-dev-1')`);
check('补偿后 sleep=0.350', s1.includes('sleep 0.350'), s1);
check('末次迭代不空睡（if 守卫）', s1.includes('if [ $i -lt 16 ]') && !/\bsleep [0-9.]+; done$/.test(s1), s1.slice(-60));
check('补偿默认开启', await js(`TC.ADB.debug().cfg.comp`) === true);

// 关闭补偿：sleep = 原始 500ms
await js(`TC.ADB.debug().cfg.comp = false`);
const s2 = await js(`TC.ADB.genScript({ type: 'tap', name: 't', x: 5, y: 5, n: 16, gap: 500, lead: '', devs: [] }, 'tc-dev-1')`);
check('关闭补偿 sleep=0.500', s2.includes('sleep 0.500'), s2.slice(-60));

// 无实测开销（TI=0）时不补偿
await js(`TC.ADB.debug().cfg.comp = true`);
await js(`TC.ADB._dev('tc-dev-2')`);   // TI=0
const s3 = await js(`TC.ADB.genScript({ type: 'tap', name: 't', x: 5, y: 5, n: 8, gap: 500, lead: '', devs: [] }, 'tc-dev-2')`);
check('无开销数据不补偿', s3.includes('sleep 0.500'), s3.slice(-60));

// 极小间隔的 50ms 下限保护
const s4 = await js(`TC.ADB.genScript({ type: 'tap', name: 't', x: 5, y: 5, n: 4, gap: 100, lead: '', devs: [] }, 'tc-dev-1')`);
check('小间隔下限保护（≥50ms）', s4.includes('sleep 0.050'), s4.slice(-60));

// UI：间隔补偿开关存在且勾选
await js(`document.getElementById('btn-adb').click()`);
await sleep(300);
check('抽屉有间隔补偿开关', await js(`document.getElementById('adb-comp') && document.getElementById('adb-comp').checked`) === true);

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#27 连点优化：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
