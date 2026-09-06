/* 循环#26 E2E：设备行 USB/IP 标注 + 移除功能（含动作引用清理）——演练隔离环境 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c26-profile');
const PORT = 9233;
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
await sleep(1200);
await js(`TC.ADB._dev('192.168.31.154:37257')`);
await js(`TC.ADB._dev('tc-usb-1')`);
await js(`TC.ADB.debug().cfg.actions = [{ id: 'a1', type: 'tap', name: '引用清理', x: 1, y: 1, n: 1, gap: 300, lead: 0, devs: ['tc-usb-1'], on: true }]`);
await js(`TC.ADB._dev('192.168.31.154:37257'); TC.ADB._dev('tc-usb-1')`);   // removeDevice 内部调 renderDevices 前 devs 已在；重注入确保两行都在
await sleep(300);

const rows = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('#adb-devices .adb-dev')].map(r => ({
  type: r.querySelector('.d-type') ? r.querySelector('.d-type').textContent : null,
  cls: r.querySelector('.d-type') ? r.querySelector('.d-type').className : null,
  hasDel: !!r.querySelector('.d-del')
})))`));
const ipRow = rows.find(r => r.type === 'IP');
const usbRow = rows.find(r => r.type === 'USB');
check('IP 设备标注 IP 徽章', !!ipRow && ipRow.cls.includes('t-IP'), ipRow);
check('USB 设备标注 USB 徽章', !!usbRow && usbRow.cls.includes('t-USB'), usbRow);
check('每行都有移除按钮', rows.every(r => r.hasDel), rows);

// 移除 USB 设备：记录清掉 + 动作引用清掉
await js(`TC.ADB.removeDevice('tc-usb-1')`);
await sleep(300);
const st = JSON.parse(await js(`JSON.stringify({
  inCfg: !!TC.ADB.debug().cfg.devices['tc-usb-1'],
  actionRefs: TC.ADB.debug().cfg.actions[0].devs,
  grayRows: [...document.querySelectorAll('#adb-devices .adb-dev')].length
})`));
check('移除后 cfg.devices 无该设备', st.inCfg === false, st);
check('动作里的设备引用被清理', st.actionRefs.length === 0, st.actionRefs);
check('行数减少', st.grayRows < rows.length, { before: rows.length, after: st.grayRows });

try { await js('electronAPI.send("close")'); } catch (_) {}
await sleep(1500);
try { child.kill(); } catch (_) {}

const failed = results.filter(p => !p).length;
console.log('\n==== 循环#26 设备标注与移除：' + (results.length - failed) + '/' + results.length + ' 通过 ====');
process.exit(failed ? 1 : 0);
