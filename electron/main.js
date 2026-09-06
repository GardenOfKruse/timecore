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

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
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

ipcMain.handle('adb:detect', async (e, payload) => {
  const given = payload && payload.path;
  const cands = [];
  if (given) cands.push(given);
  cands.push('adb');
  cands.push(pathM.join(app.getPath('userData'), 'platform-tools', 'adb.exe'));
  if (process.env.LOCALAPPDATA) cands.push(pathM.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
  cands.push('C:\\platform-tools\\adb.exe');
  for (const c of cands) {
    const r = await runProcess(c, ['version'], 4000);
    if (r.ok && /Android Debug Bridge/.test(r.stdout)) {
      return { ok: true, path: c, version: (r.stdout.match(/version ([\d.]+)/) || [])[1] || '' };
    }
  }
  const w = await runProcess('where', ['adb'], 4000);
  if (w.ok) {
    const first = w.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (first) {
      const r = await runProcess(first, ['version'], 4000);
      if (r.ok && /Android Debug Bridge/.test(r.stdout)) {
        return { ok: true, path: first, version: (r.stdout.match(/version ([\d.]+)/) || [])[1] || '' };
      }
    }
  }
  return { ok: false };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
