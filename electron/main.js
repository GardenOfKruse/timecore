/* Electron 主进程：透明无边框窗口 + 始终置顶 + 全屏 + 透明度 + ADB 齐射 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const pathM = require('path');

/* 测试隔离：TC_TMP_PROFILE 指定时使用独立 userData，避免污染真实配置 */
if (process.env.TC_TMP_PROFILE) app.setPath('userData', process.env.TC_TMP_PROFILE);

let win = null;
let fsState = false;       // 显式全屏状态：透明窗口上 isFullScreen() 会误报，不能信任
let prevBounds = null;

/* 窗口尺寸预设（迷你/紧凑/标准）与位置记忆：bounds 存 userData/tc-window.json */
const PRESETS = { mini: [380, 300], compact: [660, 460], standard: [1180, 760] };

function boundsFile() { return pathM.join(app.getPath('userData'), 'tc-window.json'); }

// 钳回显示器工作区：预设/记忆尺寸可能大于当前屏幕（小屏笔记本、换显示器）
function clampToWork(b) {
  const wa = screen.getDisplayMatching(b).workArea;
  const w = Math.min(b.width, wa.width - 10), h = Math.min(b.height, wa.height - 10);
  return {
    x: Math.max(wa.x, Math.min(b.x, wa.x + wa.width - w)),
    y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - h)),
    width: w, height: h
  };
}

function saveBounds() {
  // 全屏期间不覆盖记忆，否则重开是全屏尺寸；setBounds/移窗都会触发
  if (!win || win.isDestroyed() || fsState) return;
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
    title: 'TIMECORE',
    icon: pathM.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: pathM.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // 位置/尺寸记忆：拖动、拉伸去抖保存（全屏期间由 saveBounds 自行跳过）
  win.on('resize', saveBoundsSoon);
  win.on('move', saveBoundsSoon);
  win.on('close', saveBounds);
  // 外部途径引起的全屏变化（如 HTML5 全屏）也要回写显式状态
  win.on('enter-full-screen', () => { fsState = true; });
  win.on('leave-full-screen', () => { fsState = false; });
  win.loadFile(pathM.join(__dirname, '..', 'index.html'));
}

ipcMain.on('win', (ev, cmd, arg) => {
  if (!win) return;
  switch (cmd) {
    case 'top': {
      const v = !win.isAlwaysOnTop();
      win.setAlwaysOnTop(v, 'screen-saver');
      break;
    }
    case 'opacity': win.setOpacity(Math.min(1, Math.max(0.3, Number(arg) || 1))); break;
    case 'minimize': win.minimize(); break;
    case 'fullscreen': {
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
      break;
    }
    case 'size': {
      // 尺寸预设：保持窗口中心不变，钳到所在显示器工作区；全屏中先退出再应用
      const p = PRESETS[arg && arg.preset];
      if (!p) break;
      if (fsState) { fsState = false; win.setFullScreen(false); }
      const cur = win.getBounds();
      const wa = screen.getDisplayMatching({ x: cur.x, y: cur.y, width: p[0], height: p[1] }).workArea;
      const w = Math.min(p[0], wa.width - 10), h = Math.min(p[1], wa.height - 10);
      const x = Math.max(wa.x, Math.min(Math.round(cur.x + cur.width / 2 - w / 2), wa.x + wa.width - w));
      const y = Math.max(wa.y, Math.min(Math.round(cur.y + cur.height / 2 - h / 2), wa.y + wa.height - h));
      win.setBounds({ x, y, width: w, height: h });
      break;
    }
    case 'close': win.close(); break;
  }
});

ipcMain.handle('win:get', () => win ? { top: win.isAlwaysOnTop(), fs: fsState } : { top: false, fs: false });

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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
