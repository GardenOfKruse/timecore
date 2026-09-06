/* 循环#21 E2E：齐射双发 BUG 回归（同节点重排不得二次发射）——全程演练模式，绝不真执行
 * 前置：本机装有 adb 且至少一台设备在线（dry=true，扫描只读，安全） */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c21-profile');
const PORT = 9230;
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
await sleep(300);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};

// 安全阀：全程演练模式
await js(`TC.ADB.dry(true)`);
check('演练模式已锁死', (await js(`TC.ADB.debug().cfg.dry`)) === true);

await js(`TC.ADB.setEnabled(true)`);
await new Promise(r => setTimeout(r, 1500));   // 等 detect + scan
const dbg0 = JSON.parse(await js(`JSON.stringify(TC.ADB.debug())`));
check('adb 可用', dbg0.adbOk === true, { path: dbg0.adbPath });

// 注入模拟在线设备（演练模式专用，免疫扫描清理，不参与真实发射）+ 单次动作（1 次 / 300ms，复现用户配置）
// 动作 devs 指定模拟机：与真实设备上下线/延迟重测完全隔离，断言确定性
await js(`TC.ADB._dev('tc-test-1')`);
await js(`TC.ADB.debug().cfg.actions = [{ id: 'fix1', type: 'tap', name: '双发回归', x: 5, y: 5, n: 1, gap: 300, lead: 0, devs: ['tc-test-1'], on: true }]`);
check('模拟设备就位', (await js(`TC.ADB.debug().devices.some(d => d.serial === 'tc-test-1' && d.state === 'device')`)) === true);

const dryLogs = () => js(`TC.ADB.debug().logs.filter(l => l.includes('【演练')).length`);
const dryFirst = () => js(`TC.ADB.debug().logs.find(l => l.includes('【演练')) || ''`);

// 1) 首次布防：恰好 1 路（预发射在 fireAt-1.8s 拉起，演练）
const node = await js(`Math.floor(TC.time.epoch()) + 5000`);
await js(`TC.ADB.arm(${node})`);
await sleep(3600);   // spawnAt ≈ now+3.0s，确保第一次 fireOne 已发生
check('首次发射恰好 1 路', (await dryLogs()) === 1, { logs: await dryLogs() });

// 2) 发射窗口内的重排（用户改配置/扫描重测延迟/save 触发）：同路径不得二次发射
await js(`TC.ADB.arm(${node})`);
await sleep(700);
const afterRearm = await dryLogs();
const spawned = await js(`TC.ADB.debug().spawnedN`);
check('同节点重排不补发', afterRearm === 1, { logs: afterRearm });
check('发射记录去重生效', spawned === 1, spawned);

// 3) 单次动作脚本不得含循环/尾巴 sleep（杜绝多点可能）
const scriptTxt = await dryFirst();
check('n=1 脚本为单发 input tap', scriptTxt.includes('input tap') && !scriptTxt.includes('seq') && !scriptTxt.includes('sleep 0.3'), scriptTxt.slice(-60));

// 4) 换新节点：允许重新发射（合法的第二轮）
const node2 = await js(`Math.floor(TC.time.epoch()) + 4500`);
await js(`TC.ADB.arm(${node2})`);
await sleep(3100);   // spawnAt ≈ now+2.5s
check('新节点正常再发射（日志=2）', (await dryLogs()) === 2, { logs: await dryLogs() });

// 5) 停止：发射记录作废（下一轮倒计时从零开始）
await js(`TC.ADB.setEnabled(false)`);
check('停用后发射记录清空', (await js(`TC.ADB.debug().spawnedN`)) === 0);

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#21 双发回归：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
