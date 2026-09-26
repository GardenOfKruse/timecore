/* Electron 主进程：透明无边框窗口 + 始终置顶 + 全屏 + 透明度 + ADB 齐射 */
const { app, BrowserWindow, ipcMain, screen, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const pathM = require('path');
require('../js/generated/window-bounds-model.js');
const windowBoundsModel = globalThis.TimeCoreDomain.createWindowBoundsModel();
require('../js/generated/window-command-model.js');
const windowCommandModel = globalThis.TimeCoreDomain.createWindowCommandModel();
require('../js/generated/companion-protocol.js');
const companionProtocol = globalThis.TimeCoreDomain.createCompanionProtocol();
const { createCompanionServer } = require('./companion-server.js');
const companionServer = createCompanionServer({
  log: msg => { try { console.log('[companion]', msg); } catch (_) {} }
});
let companionLan = false;

/* 测试隔离：TC_TMP_PROFILE 指定时使用独立 userData，避免污染真实配置 */
if (process.env.TC_TMP_PROFILE) app.setPath('userData', process.env.TC_TMP_PROFILE);

let win = null;
let fsState = false;       // 显式全屏状态：透明窗口上 isFullScreen() 会误报，不能信任
let prevBounds = null;

/* 窗口尺寸预设与位置记忆：bounds 存 userData/tc-window.json
 * 四形态同一窗口：正常(standard) / 小窗(small) / 仅时间(clock：缩到钟面+只显示时钟) / 全屏(F)
 * mini/compact 为旧版兼容别名 */
let clockMode = false;       // 仅时间形态中
let clockPrev = null;        // 进入仅时间前的 bounds（退出时还原）
let moveTimer = null;        // 手动拖窗（钟面）：钟面禁用 app-region:drag，移动走增量 setPosition
let moveStart = null;
let leftButtonHeld = false;  // 渲染层物理左键状态；与 moveTimer 分离，覆盖失焦/捕获丢失

function beginMove() {
  if (!win) return;
  cancelTween();   // 拖动优先，缓动让路
  twLast = null;   // 拖动与缩放完全解耦，不能沿用上一次滚轮目标
  moveStart = { c: screen.getCursorScreenPoint(), b: win.getBounds() };
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    if (!win || win.isDestroyed()) { endMove(); return; }
    const c = screen.getCursorScreenPoint();
    win.setPosition(moveStart.b.x + c.x - moveStart.c.x, moveStart.b.y + c.y - moveStart.c.y);
  }, 16);
}
function endMove() { clearInterval(moveTimer); moveTimer = null; moveStart = null; }

/* 窗口缓动：形态切换/滚轮缩放不再一步跳变（easeOutCubic ~170ms，步进 16ms）。
 * 可重定向——滚轮连滚时在逻辑目标上累乘、动画只负责追赶显示；
 * 结尾一步强制落到精确目标（E2E 有 innerWidth 精确断言）。拖动/全屏/关闭立即取消。 */
let twTimer = null, twLast = null;   // twLast：最近一次缓动的目标 bounds（连滚重定向的基准）
function cancelTween() { if (twTimer) { clearInterval(twTimer); twTimer = null; } }
function tweenBounds(target) {
  cancelTween();
  twLast = target;
  const from = win.getBounds();
  const dist = Math.abs(from.x - target.x) + Math.abs(from.y - target.y) +
    Math.abs(from.width - target.width) + Math.abs(from.height - target.height);
  if (dist < 2) { win.setBounds(target); return; }
  const D = 170, T0 = Date.now();
  twTimer = setInterval(() => {
    if (!win || win.isDestroyed()) { cancelTween(); return; }
    const t = Math.min(1, (Date.now() - T0) / D);
    if (t >= 1) { cancelTween(); win.setBounds(target); return; }
    const k = 1 - Math.pow(1 - t, 3);
    win.setBounds({
      x: Math.round(from.x + (target.x - from.x) * k),
      y: Math.round(from.y + (target.y - from.y) * k),
      width: Math.round(from.width + (target.width - from.width) * k),
      height: Math.round(from.height + (target.height - from.height) * k)
    });
  }, 16);
}

function boundsFile() { return pathM.join(app.getPath('userData'), 'tc-window.json'); }
function clockSizeFile() { return pathM.join(app.getPath('userData'), 'tc-clock.json'); }
function savedClockW() { try { return JSON.parse(fs.readFileSync(clockSizeFile(), 'utf8')).w || 0; } catch (_) { return 0; } }
function saveClockW(w) { try { fs.writeFileSync(clockSizeFile(), JSON.stringify({ w })); } catch (_) {} }

// 钳回显示器工作区：预设/记忆尺寸可能大于当前屏幕（小屏笔记本、换显示器）
function clampToWork(b) {
  const wa = screen.getDisplayMatching(b).workArea;
  return windowBoundsModel.clampToWork(b, wa);
}

function saveBounds() {
  // 全屏与仅时间形态期间不覆盖记忆（钟面尺寸/原尺寸还原交给 clockPrev），否则重开是变形尺寸
  if (!win || win.isDestroyed() || fsState || clockMode) return;
  try { fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds())); } catch (_) {}
}
function saveBoundsSoon() { clearTimeout(saveBoundsSoon.t); saveBoundsSoon.t = setTimeout(saveBounds, 400); }

function createWindow() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); } catch (_) {}
  const b = saved && saved.width >= 320 && saved.height >= 240 ? clampToWork(saved) : null;
  win = new BrowserWindow({
    width: b ? b.width : 1180,
    height: b ? b.height : 760,
    ...(b ? { x: b.x, y: b.y } : {}),
    minWidth: 320,
    minHeight: 240,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    fullscreenable: true,
    show: false,   // 开场仪式：渲染就绪再显示，避免空窗闪现
    title: 'TIMECORE',
    icon: pathM.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: pathM.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.once('ready-to-show', () => { if (win && !win.isDestroyed()) win.show(); });
  win.setAlwaysOnTop(true, 'screen-saver');
  // 位置/尺寸记忆：拖动、拉伸去抖保存（全屏期间由 saveBounds 自行跳过）
  win.on('resize', saveBoundsSoon);
  win.on('move', saveBoundsSoon);
  win.on('close', saveBounds);
  // 外部途径引起的全屏变化（如 HTML5 全屏）也要回写显式状态
  win.on('enter-full-screen', () => { fsState = true; });
  win.on('leave-full-screen', () => { fsState = false });
  win.on('focus', () => { try { win.flashFrame(false); } catch (_) {} });   // 用户回到窗口即停止任务栏闪烁
  win.webContents.on('context-menu', showContextMenu);   // 右键菜单（钟面形态的主入口：拖拽区不透传鼠标事件）
  win.loadFile(pathM.join(__dirname, '..', 'index.html'));
}

/* 窗口命令（IPC 与右键菜单共用） */
function pushState() {   // 形态/全屏/置顶变化即时推给渲染层（类名秒级翻转，动画不迟到）
  if (win && !win.isDestroyed()) {
    win.webContents.send('win:state', windowCommandModel.snapshot({
      clock: clockMode, top: win.isAlwaysOnTop(), fs: fsState
    }));
  }
}
function toggleTop() {
  if (!win) return;
  win.setAlwaysOnTop(!win.isAlwaysOnTop(), 'screen-saver');
  pushState();
}
function toggleFs() {
  if (!win) return;
  cancelTween();   // 全屏边界与缓动目标系不同，直接取消进行中的缓动
  // 透明无边框窗口上 isFullScreen() 误报，用显式状态取反；
  // setBounds 做真实尺寸变化，setFullScreen 仅负责隐藏任务栏
  fsState = !fsState;
  if (fsState) {
    prevBounds = win.getBounds();
    win.setBounds(screen.getPrimaryDisplay().bounds);
    win.setFullScreen(true);
  } else {
    win.setFullScreen(false);
    if (prevBounds) win.setBounds(prevBounds);
  }
  pushState();
}
function exitClock() {
  clockMode = false;
  win.setIgnoreMouseEvents(false);
  win.setMinimumSize(320, 240);
  if (clockPrev) tweenBounds(clockPrev);
}
function doSize(arg) {
  if (!win) return;
  // 'clock'（仅时间形态）为开关：进入时记住原 bounds，退出时还原——同一窗口的不同形态
  if (arg && arg.preset === 'clock') {
    if (clockMode) { exitClock(); pushState(); return; }
    clockPrev = win.getBounds();
    clockMode = true;
    if (fsState) { fsState = false; win.setFullScreen(false); }
    win.setMinimumSize(120, 60);
    // 缩放记忆：恢复上次的钟面宽度（首次为 280）；宽高比恒定，applyPreset 会钳到工作区
    applyPreset(windowBoundsModel.clockSize(savedClockW()));
    pushState();
    return;
  }
  // 其它预设：若在仅时间形态，先还原形态（clockPrev 为准，避免以钟面尺寸进入常规预设）
  if (clockMode) exitClock();
  const p = windowBoundsModel.getPreset(arg && arg.preset);
  if (!p) return;
  if (fsState) { fsState = false; win.setFullScreen(false); }
  applyPreset(p);
  pushState();
}
function applyPreset(p) {
  const cur = win.getBounds();
  const wa = screen.getDisplayMatching({ x: cur.x, y: cur.y, width: p.width, height: p.height }).workArea;
  tweenBounds(windowBoundsModel.centerPreset(cur, wa, p));
}
function zoomClock(input) {
  const isObject = input && typeof input === 'object';
  const delta = isObject ? Number(input.delta) || 0 : Number(input) || 0;
  const buttons = isObject ? Number(input.buttons) || 0 : 0;
  if (!win || !clockMode || moveTimer || leftButtonHeld || (buttons & 1)) return;
  // 连滚基准取逻辑目标（而非动画途中的实际 bounds），尺寸序列与逐次到位完全一致
  const base = (twTimer && twLast) ? twLast : win.getBounds();
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  const target = windowBoundsModel.zoomClock(base, wa, delta);
  if (!target) return; // 到达边界后不再重算位置，避免滚轮继续让窗口漂移
  saveClockW(target.width);   // 缩放记忆：下次进入钟面恢复此宽度
  tweenBounds(target);
}

/* 右键菜单：全形态可用（钟面形态的尺寸/退出主入口——拖拽区不向页面投递鼠标事件，页内按钮收不到） */
function showContextMenu() {
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: '还原窗口（退出仅时间）', visible: clockMode, click: () => doSize({ preset: 'clock' }) },
    { type: 'separator', visible: clockMode },
    { label: '正常 1180×760', click: () => doSize({ preset: 'standard' }) },
    { label: '小窗 480×320', click: () => doSize({ preset: 'small' }) },
    { label: '仅时间 280×96', click: () => doSize({ preset: 'clock' }) },
    { type: 'separator' },
    { label: fsState ? '退出全屏' : '全屏', click: toggleFs },
    { label: win.isAlwaysOnTop() ? '取消置顶' : '窗口置顶', click: toggleTop },
    { type: 'separator' },
    { label: '关闭', click: () => win.close() }
  ]);
  menu.popup({ window: win });
}

ipcMain.on('companion', (ev, cmd, arg) => {
  const intent = companionProtocol.routeCommand(cmd, arg);
  if (!intent) return;
  if (intent.type === 'set-enabled') {
    companionLan = intent.enabled;
    if (intent.enabled) {
      companionServer.start(8399, '0.0.0.0', 10).then(port => {
        if (win) pushState();
      });
    } else {
      companionServer.stop();
      if (win) pushState();
    }
  } else if (intent.type === 'push-state') {
    companionServer.setState(intent.state);
  }
});

ipcMain.on('win', (ev, cmd, arg) => {
  if (!win) return;
  const intent = windowCommandModel.route(cmd, arg);
  if (!intent) return;
  switch (intent.type) {
    case 'toggle-top': toggleTop(); break;
    case 'set-opacity': win.setOpacity(intent.value); break;
    case 'minimize': win.minimize(); break;
    case 'toggle-fullscreen': toggleFs(); break;
    case 'size': doSize({ preset: intent.preset }); break;
    case 'move-begin': beginMove(); break;
    case 'move-end': endMove(); break;
    case 'set-left-button': leftButtonHeld = intent.held; break;
    case 'zoom-clock': zoomClock(intent); break;
    case 'open': shell.openExternal(intent.url); break;
    case 'flash': if (win && (!win.isFocused() || win.isMinimized())) win.flashFrame(true); break;   // 到点任务栏闪烁；聚焦即停
    case 'set-login':   // 开机自启（v1.26.0）：openAsHidden 让登录后窗口隐藏启动，由 ready-to-show 流程接管
      try { app.setLoginItemSettings({ openAtLogin: intent.enable === true, openAsHidden: true }); } catch (_) {}
      break;
    case 'close': win.close(); break;
  }
});

ipcMain.handle('win:get', () => ({
  ...windowCommandModel.snapshot({
    top: win ? win.isAlwaysOnTop() : false, fs: fsState, clock: clockMode
  }),
  ver: app.getVersion(),
  companion: companionServer.info(companionLan),
  login: (() => { try { return app.getLoginItemSettings().openAtLogin; } catch (_) { return false; } })()
}));

/* ---------- ADB 齐射（仅 Windows 桌面端） ---------- */
const ADB_CMDS = new Set(['detect', 'exec']);

function runProcess(path, args, timeoutMs, binary) {
  return new Promise(resolve => {
    const chunks = [];
    let err = '';
    const t0 = Date.now();
    let p;
    try { p = spawn(path, args, { windowsHide: true }); }
    catch (e) { return resolve({ ok: false, error: String(e), durMs: 0 }); }
    const to = setTimeout(() => { try { p.kill(); } catch (_) {} err += '\n[超时]'; }, timeoutMs || 30000);
    p.stdout.on('data', d => { chunks.push(d); });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e2 => { clearTimeout(to); resolve({ ok: false, error: String(e2), durMs: Date.now() - t0 }); });
    p.on('close', code => {
      clearTimeout(to);
      const buf = Buffer.concat(chunks);
      resolve({
        ok: code === 0, code,
        stdout: buf.toString('utf8'),
        stderr: err,
        b64: binary ? buf.toString('base64') : undefined,
        durMs: Date.now() - t0, startedAt: t0
      });
    });
  });
}

ipcMain.handle('adb:exec', (e, payload) => {
  const { path, args, timeoutMs, binary } = payload || {};
  return runProcess(path || 'adb', Array.isArray(args) ? args : [], timeoutMs, !!binary);
});

/* 选点截图存档（v1.20.0）：按动作 id 存 userData/adb-shots/<id>.png，重启后打开浮层仍能看到当时的截图 */
function shotsDir() {
  return pathM.join(app.getPath('userData'), 'adb-shots');
}
function validShotName(name) {
  return /^[a-z0-9_-]{1,64}$/i.test(String(name || ''));
}
ipcMain.handle('adb:shot-save', (e, payload) => {
  try {
    const { name, b64 } = payload || {};
    if (!validShotName(name) || typeof b64 !== 'string' || b64.length < 100) return { ok: false };
    fs.mkdirSync(shotsDir(), { recursive: true });
    fs.writeFileSync(pathM.join(shotsDir(), name + '.png'), Buffer.from(b64, 'base64'));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 80) };
  }
});
ipcMain.handle('adb:shot-load', (e, payload) => {
  try {
    const name = (payload || {}).name;
    if (!validShotName(name)) return { ok: false };
    const p = pathM.join(shotsDir(), name + '.png');
    if (!fs.existsSync(p)) return { ok: false, error: 'none' };
    return { ok: true, b64: fs.readFileSync(p).toString('base64') };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 80) };
  }
});

/* 一键下载官方 platform-tools（约 6MB），解压到 userData，用户无需自行安装 adb */
ipcMain.handle('adb:download', async () => {
  try {
    const dest = app.getPath('userData');
    const adbExe = pathM.join(dest, 'platform-tools', 'adb.exe');
    if (fs.existsSync(adbExe)) return { ok: true, path: adbExe };
    const res = await fetch('https://dl.google.com/android/repository/platform-tools-latest-windows.zip');
    if (!res.ok) return { ok: false, error: '下载失败 HTTP ' + res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    const tmpZip = pathM.join(app.getPath('temp'), 'platform-tools-latest-windows.zip');
    fs.writeFileSync(tmpZip, buf);
    fs.mkdirSync(dest, { recursive: true });
    // Win10+ 自带 bsdtar 可解 zip；异常时回退 PowerShell
    await new Promise(resolve => {
      const p = spawn('tar', ['-xf', tmpZip, '-C', dest], { windowsHide: true });
      p.on('close', () => resolve()); p.on('error', () => resolve());
    });
    if (!fs.existsSync(adbExe)) {
      await new Promise(resolve => {
        const p = spawn('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmpZip}' -DestinationPath '${dest}' -Force`], { windowsHide: true });
        p.on('close', () => resolve()); p.on('error', () => resolve());
      });
    }
    fs.rmSync(tmpZip, { force: true });
    if (!fs.existsSync(adbExe)) return { ok: false, error: '解压失败，请手动下载 platform-tools 并在路径框指定' };
    return { ok: true, path: adbExe };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120) };
  }
});

/* 现代 platform-tools 统一报 version 1.0.41（附 Version 34+ 构建号）；
 * 1.0.3x 及更早是十多年前的旧版，USB 可用但无 Android 11+ 无线调试（TLS）能力 */
const ADB_MODERN = /version 1\.0\.41/;

ipcMain.handle('adb:detect', async (e, payload) => {
  const given = payload && payload.path;
  // 候选顺序：用户指定 → 自家 platform-tools → PATH → SDK → 常见目录。
  // 自家优先于 PATH：PATH 上常驻旧版 adb（1.0.3x），会让无线调试"连上即离线"
  const cands = [];
  if (given) cands.push(given);
  cands.push(pathM.join(app.getPath('userData'), 'platform-tools', 'adb.exe'));
  cands.push('adb');
  if (process.env.LOCALAPPDATA) cands.push(pathM.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
  cands.push('C:\\platform-tools\\adb.exe');
  const seen = new Set();
  let fallback = null;
  for (const c of cands) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const r = await runProcess(c, ['version'], 4000);
    if (r.ok && /Android Debug Bridge/.test(r.stdout)) {
      const version = (r.stdout.match(/version ([\d.]+)/) || [])[1] || '';
      if (given && c === given) return { ok: true, path: c, version };   // 用户指定路径即采纳
      if (ADB_MODERN.test(r.stdout)) return { ok: true, path: c, version };   // 现代版直接采纳
      if (!fallback) fallback = { ok: true, path: c, version };   // 旧版仅兜底，继续找更好的
    }
  }
  const w = await runProcess('where', ['adb'], 4000);
  if (w.ok) {
    const first = w.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (first && !seen.has(first)) {
      const r = await runProcess(first, ['version'], 4000);
      if (r.ok && /Android Debug Bridge/.test(r.stdout)) {
        const version = (r.stdout.match(/version ([\d.]+)/) || [])[1] || '';
        if (ADB_MODERN.test(r.stdout)) return { ok: true, path: first, version };
        if (!fallback) fallback = { ok: true, path: first, version };
      }
    }
  }
  return fallback || { ok: false };
});

app.whenReady().then(() => {
  createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
