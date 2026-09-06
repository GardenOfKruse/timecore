/* 循环#24 E2E：旧版 adb 判定 + 一键升级链路（下载到隔离 profile，不碰真实配置）
 * 本机 PATH adb 为 1.0.36（旧）：验证判定为过旧 → 升级按钮可见 → 下载后切到 1.0.41 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c24-profile');
const PORT = 9236;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout')); } }, 60000);
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
await new Promise(r => setTimeout(r, 1500));
const d0 = JSON.parse(await js(`JSON.stringify(TC.ADB.debug())`));
const verAncient = /^1\.0\.(\d+)$/.test(d0.adbVer) && parseInt(d0.adbVer.split('.')[2], 10) < 41;
check('adb 检测成功', d0.adbOk === true, { path: d0.adbPath, ver: d0.adbVer });
check('旧版判定与版本号一致', d0.adbAncient === verAncient, { ancient: d0.adbAncient, ver: d0.adbVer });
check('本机 PATH 为旧版（前置条件）', verAncient === true, d0.adbVer);

// 抽屉：升级按钮可见 + 状态行警告
await js(`document.getElementById('btn-adb').click()`);
await sleep(400);
const ui0 = JSON.parse(await js(`JSON.stringify({
  dlHidden: document.getElementById('adb-download').hidden,
  dlText: document.getElementById('adb-download').textContent,
  status: document.getElementById('adb-status').textContent
})`));
check('升级按钮可见且文案为升级', ui0.dlHidden === false && ui0.dlText.includes('升级'), { hidden: ui0.dlHidden, text: ui0.dlText });
check('状态行提示版本过旧', ui0.status.includes('过旧'), ui0.status.slice(0, 50));

// 真实升级链路：下载官方 platform-tools 到隔离 profile → 检测切到新版
console.log('...下载中（官方 platform-tools ~6MB）...');
await js(`document.getElementById('adb-download').click()`);
let upgraded = false;
for (let i = 0; i < 60; i++) {
  const d1 = JSON.parse(await js(`JSON.stringify(TC.ADB.debug())`));
  if (!d1.adbAncient && d1.adbOk) { upgraded = true; break; }
  await sleep(1500);
}
const d1 = JSON.parse(await js(`JSON.stringify(TC.ADB.debug())`));
check('升级后 adb 切到 1.0.41', upgraded && d1.adbVer === '1.0.41', { ver: d1.adbVer, path: d1.adbPath, ancient: d1.adbAncient });
check('自家 platform-tools 被优先采用', d1.adbPath.includes('platform-tools'), d1.adbPath);
check('升级后按钮隐藏', await js(`document.getElementById('adb-download').hidden`), null);
check('升级缓存已落位', existsSync(path.join(PROFILE, 'platform-tools', 'adb.exe')), null);

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#24 旧版 adb 升级链路：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
