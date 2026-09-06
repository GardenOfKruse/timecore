/* 循环#19 E2E：首启欢迎卡 / ADB 门槛与引导 / 开始停止状态化 / 尺寸预设 / 位置记忆
 * 双阶段：A=全新 profile 首启动动线；B=同 profile 重启（记忆恢复、老用户不打扰）
 * 用法：node tests/cycle19.mjs（自行拉起 electron，TC_TMP_PROFILE 隔离，不碰真实配置） */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c19-profile');
const PORT = 9226;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
}

let seq = 0;
const pending = new Map();
let ws = null;

function evalInPage(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout')); } }, 15000);
  });
}
async function js(expr) {
  const r = await evalInPage(expr);
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result ? r.result.value : undefined;
}
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('cdp timeout: ' + method)); } }, 15000);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = ev => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) {
            const { resolve } = pending.get(m.id);
            pending.delete(m.id);
            resolve(m.result);
          }
        };
        await js('!!window.TC');
        await sleep(900);   // 等 boot 完成（欢迎卡/密度/引导渲染）
        return page;
      }
    } catch (_) { /* electron 未就绪，重试 */ }
    await sleep(500);
  }
  throw new Error('无法连接应用页面');
}

async function waitJs(expr, timeout = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await js(expr)) return true;
    await sleep(150);
  }
  return false;
}

async function trustedClick(expr) {
  const p = await js(expr);
  if (!p) throw new Error('trustedClick 目标不可见');
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(400);
}

let child = null;
function launch() {
  child = spawn(ELECTRON, [ROOT, '--remote-debugging-port=' + PORT], {
    cwd: ROOT, env: { ...process.env, TC_TMP_PROFILE: PROFILE }, stdio: 'ignore'
  });
  child.on('error', e => console.error('electron 启动失败:', e));
}
async function quit() {
  if (!child || child.exitCode != null) return;
  // 优雅退出：close IPC → window-all-closed → app.quit()，保证 localStorage 落盘与 bounds 保存；
  // Windows 上 child.kill() 是硬终止，会丢 leveldb 未刷盘数据
  try { await js('window.electronAPI ? (electronAPI.send("close"), true) : false'); } catch (_) {}
  const t0 = Date.now();
  while (child.exitCode == null && Date.now() - t0 < 5000) await sleep(200);
  if (child.exitCode == null) { try { child.kill(); } catch (_) {} await sleep(500); }
}

/* ================= 阶段 A：全新 profile ================= */
rmSync(PROFILE, { recursive: true, force: true });
launch();
await connect();

const a0 = await js(`JSON.stringify({
  welcome: !document.getElementById('welcome').hidden,
  freerun: TC.Beats.stats().freerun,
  adbEnabled: TC.ADB.debug().cfg.enabled,
  startTxt: document.getElementById('cd-start').textContent,
  stopDisabled: document.getElementById('cd-stop').disabled,
  lights: !!document.getElementById('lt-sync')
})`);
const s0 = JSON.parse(a0);
check('A 首启欢迎卡出现', s0.welcome, s0);
check('A 首启节拍器不自启', s0.freerun === false, s0.freerun);
check('A ADB 默认停用', s0.adbEnabled === false, s0.adbEnabled);
check('A 空闲态：开始/停止', s0.startTxt === '开始' && s0.stopDisabled === true, s0);
check('A 标题栏状态灯存在', s0.lights, s0);

const shot = await call('Page.captureScreenshot', { format: 'png' });
writeFileSync(path.join(ROOT, 'docs', 'welcome.png'), Buffer.from(shot.data, 'base64'));
console.log('== 截图 == docs/welcome.png');

// 开始/停止状态化：10s 对齐 → 运行态；停止 → 空闲态
await js(`document.querySelector('.chip-btn[data-sec="10"]').click()`);
await sleep(400);
const s1 = JSON.parse(await js(`JSON.stringify({ t: document.getElementById('cd-start').textContent, d: document.getElementById('cd-stop').disabled })`));
check('A 运行态：开始→重新布防', s1.t === '重新布防' && s1.d === false, s1);
await js(`TC.Countdown.stop()`);
await sleep(300);
const s2 = JSON.parse(await js(`JSON.stringify({ t: document.getElementById('cd-start').textContent, d: document.getElementById('cd-stop').disabled })`));
check('A 停止后回到空闲态', s2.t === '开始' && s2.d === true, s2);

// 受信点击「开启节拍器」：欢迎卡关闭 + 音频解锁
await trustedClick(`(() => { const r = document.getElementById('wl-beat').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const s3 = JSON.parse(await js(`JSON.stringify({ welcome: document.getElementById('welcome').hidden, freerun: TC.Beats.stats().freerun, audio: TC.Audio.info().state, welcomed: localStorage.getItem('tc.welcomed') })`));
check('A 欢迎卡关闭并写入标记', s3.welcome === true && s3.welcomed === '1', s3);
check('A 节拍器随欢迎卡开启', s3.freerun === true, s3.freerun);
check('A 音频引擎已解锁', s3.audio === 'running', s3.audio);

// ADB 抽屉：未启用 → 引导卡可见 + 门槛置灰
await js(`document.getElementById('btn-adb').click()`);
await sleep(400);
const s4 = JSON.parse(await js(`JSON.stringify({
  guide: !document.getElementById('adb-guide').hidden,
  guideTxt: document.getElementById('adb-guide').textContent.slice(0, 40),
  gateOpacity: getComputedStyle(document.querySelector('.adb-gate')).opacity,
  dataOn: document.getElementById('adb-drawer').dataset.on
})`));
check('A 引导卡可见', s4.guide, s4);
check('A 未启用门槛置灰', parseFloat(s4.gateOpacity) < 0.5 && s4.dataOn === '0', s4);

// 启用总开关（真实 UI 路径）→ 门槛解除、引导推进
await js(`document.getElementById('adb-enabled').click()`);
await waitJs(`document.getElementById('adb-drawer').dataset.on === '1'`);
const s5 = JSON.parse(await js(`JSON.stringify({
  dataOn: document.getElementById('adb-drawer').dataset.on,
  gateOpacity: getComputedStyle(document.querySelector('.adb-gate')).opacity,
  enabled: TC.ADB.debug().cfg.enabled,
  light: document.getElementById('lt-adb').dataset.s
})`));
check('A 启用后门槛解除', s5.dataOn === '1' && parseFloat(s5.gateOpacity) > 0.9 && s5.enabled === true, s5);
check('A 状态灯脱离 off', s5.light && s5.light !== 'off', s5.light);
await js(`TC.ADB.setEnabled(false)`);   // 还原为停用，阶段 B 验证持久化
await sleep(300);

// 尺寸预设：迷你 → 紧凑 → 标准（密度类随宽度自适应）
await js(`electronAPI.send('size', { preset: 'mini' })`);
check('A 迷你尺寸 + 密度', await waitJs(`innerWidth < 500 && document.body.classList.contains('mini') && document.body.classList.contains('compact')`), { w: await js('innerWidth') });
await js(`electronAPI.send('size', { preset: 'compact' })`);
check('A 紧凑尺寸 + 密度', await waitJs(`innerWidth >= 500 && innerWidth < 780 && document.body.classList.contains('compact') && !document.body.classList.contains('mini')`), { w: await js('innerWidth') });
await js(`electronAPI.send('size', { preset: 'standard' })`);
check('A 标准尺寸', await waitJs(`innerWidth >= 1100 && !document.body.classList.contains('compact')`), { w: await js('innerWidth') });

await quit();
await sleep(500);
const bf = path.join(PROFILE, 'tc-window.json');
const boundsOk = existsSync(bf) && (() => { try { return JSON.parse(readFileSync(bf, 'utf8')).width >= 1100; } catch (_) { return false; } })();
check('A 位置记忆已写入（标准尺寸）', boundsOk, existsSync(bf) ? (() => { try { return JSON.parse(readFileSync(bf, 'utf8')); } catch (_) { return null; } })() : null);

/* ================= 阶段 B：重启（同 profile） ================= */
launch();
await connect();
const b0 = JSON.parse(await js(`JSON.stringify({
  fresh: TC.fresh,
  welcome: !document.getElementById('welcome').hidden,
  freerun: TC.Beats.stats().freerun,
  w: innerWidth,
  adbEnabled: TC.ADB.debug().cfg.enabled,
  dataOn: document.getElementById('adb-drawer').dataset.on,
  startTxt: document.getElementById('cd-start').textContent
})`));
check('B 重启不再显示欢迎卡', b0.fresh === false && b0.welcome === false, b0);
check('B 节拍器按用户选择自启', b0.freerun === true, b0.freerun);
check('B 窗口尺寸/位置恢复', b0.w >= 1100, b0.w);
check('B ADB 停用状态持久化', b0.adbEnabled === false && b0.dataOn === '0', { adbEnabled: b0.adbEnabled });
check('B 重启后开始/停止空闲态', b0.startTxt === '开始', b0.startTxt);

ws.close();
await quit();

const failed = results.filter(r => !r.pass);
console.log('\n==== 循环#19 E2E：' + (results.length - failed.length) + '/' + results.length + ' 通过 ====');
process.exit(failed.length ? 1 : 0);
