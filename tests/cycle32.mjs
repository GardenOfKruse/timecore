/* 循环#32 E2E：钟面左键仍按下时，失真释放事件后的滚轮不得缩放 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c32-profile-' + process.pid);
rmSync(PROFILE, { recursive: true, force: true });
const PORT = 9264;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
let ws = null;
const pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 15000);
  });
}
function js(expression) {
  return cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    .then(r => {
      if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 240));
      return r.result?.value;
    });
}
function waitForChildExit() {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
}
async function removeProfile() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      rmSync(PROFILE, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
      await sleep(100);
    }
  }
  return false;
}
async function waitJs(expression, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await js(expression)) return true;
    await sleep(100);
  }
  return false;
}

const child = spawn(ELECTRON, [ROOT, '--remote-debugging-port=' + PORT], {
  cwd: ROOT, env: { ...process.env, TC_TMP_PROFILE: PROFILE }, stdio: 'ignore'
});
try {
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      page = targets.find(t => t.type === 'page' && t.url.includes('index.html')) || null;
    } catch (_) {}
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('主窗口未就绪');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
  };
  await js('!!window.TC');
  await sleep(800);
  await js(`document.getElementById('wl-skip').click()`);
  await js(`electronAPI.send('size', { preset: 'clock' })`);
  if (!await waitJs(`document.body.classList.contains('clockmode')`)) throw new Error('未进入钟面');
  await sleep(500);

  const base = await js('({ w: innerWidth, x: innerWidth / 2, y: innerHeight / 2 })');
  await js(`window.__c32 = []; document.addEventListener('wheel', e => window.__c32.push({ buttons: e.buttons, deltaY: e.deltaY }), true)`);

  // 真实 CDP 左键按下；随后模拟焦点/指针捕获丢失后页面收到的释放清理。
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: base.x, y: base.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(700);
  const longHeld = await js('innerWidth');
  // 模拟失焦后渲染层看到的失真状态：拖动已停止，但左键物理上仍按住，
  // mousemove.buttons=0 不得被当成释放。
  await js(`window.dispatchEvent(new Event('blur')); window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))`);
  await sleep(80);

  // 即使绕过渲染层直接发 IPC，主进程仍必须保留物理左键闸门。
  await js(`electronAPI.send('clock-zoom', { delta: -120, buttons: 0 })`);
  await sleep(260);
  const direct = await js('innerWidth');

  // 物理左键仍按下：即使 wheel 的 buttons 被 Chromium 报成 0，也不得缩放。
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: base.x, y: base.y, button: 'none', buttons: 0, deltaX: 0, deltaY: -120 });
  await sleep(260);
  const held = await js('({ w: innerWidth, events: window.__c32 })');
  const passHeld = longHeld === base.w && direct === base.w && held.w === base.w;
  console.log((passHeld ? 'PASS' : 'FAIL') + '  左键长按/仍按下时不得缩放  ' + JSON.stringify({ base, longHeld, direct, held }));

  // 收尾释放真实输入，避免测试进程退出时残留按键状态。
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: base.x, y: base.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(80);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: base.x, y: base.y, button: 'none', buttons: 0, deltaX: 0, deltaY: -120 });
  await sleep(260);
  const released = await js('innerWidth');
  const passReleased = released > base.w;
  console.log((passReleased ? 'PASS' : 'FAIL') + '  左键释放后滚轮仍可缩放  ' + JSON.stringify({ released }));
  process.exitCode = passHeld && passReleased ? 0 : 1;
} finally {
  try { ws?.close(); } catch (_) {}
  child.kill();
  await Promise.race([waitForChildExit(), sleep(2000)]);
  await removeProfile();
}
