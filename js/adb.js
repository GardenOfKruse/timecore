/* ADB 齐射：倒计时到点瞬间向多台安卓设备分发动作（仅 Windows 桌面端）
 * 动作 = 模板（连点 / 亮屏再点 / 高级脚本）；选点 = 设备截图上点一下
 * 时间补偿三层：全局提前量 + 每设备传输延迟校准 + 预发射（设备端 sleep 对齐） */
(function () {
  const hasElectron = !!window.electronAPI;
  const PRESPAWN_MS = 1800;

  // enabled 默认关：首次使用先引导配置（老用户的已存值以 localStorage 为准，不受影响）
  const DEF = { path: '', leadMs: 300, cal: true, precise: true, dry: false, enabled: false, seeded: false, devices: {}, actions: [] };
  let cfg = load();
  let adbPath = cfg.path || '';
  let adbOk = false, adbVer = '';
  let adbAncient = false;   // 1.0.3x 及更早：USB 可用，但 Android 11+ 无线调试（TLS）无法握手

  function calcAncient() {
    const m = (adbVer || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    adbAncient = !!m && +m[1] === 1 && +m[2] === 0 && +m[3] < 41;
  }
  const devs = new Map();           // serial -> {serial,name,state,model,L,W,H,on}
  let timers = [];
  const logs = [];
  let plannedN = 0, armed = false, lastSig = '';
  let spawnedKeys = new Set();   // 已实际发射的「动作×设备×节点」：adb 进程一旦发出无法撤回，重排不得二次发射
  let lastArmNode = 0;

  function load() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem('tc.adb.v1') || '{}'); } catch (_) {}
    const cfg = Object.assign({}, DEF, c);
    cfg.actions = (cfg.actions || [])
      .filter(a => !(a.type === 'adv' && /getprop\s+ro\.product\.model/.test(a.script || '')))   // 清理测试遗留卡
      .map(a => {
        if (!a.type) a.type = 'adv';
        a.devs = a.devs || [];
        return a;
      });
    return cfg;
  }
  function save() {
    for (const d of devs.values()) cfg.devices[d.serial] = { name: d.name, on: d.on };
    // 合并式保存：离线/拔出设备的命名保留，不被重建清掉
    localStorage.setItem('tc.adb.v1', JSON.stringify(cfg, (k, v) => k === '_shot' ? undefined : v));
    refreshArmedBtn();
    scheduleRearm();   // 任何配置变更 → 去抖重排，倒计时进行中即时生效
  }
  function pad3(ms) { return String(Math.floor(((ms % 1000) + 1000) % 1000)).padStart(3, '0'); }
  function log(msg) {
    const e = TC.time.epoch();
    logs.unshift('[' + TC.Clock.wallClock(e, 'local') + '.' + pad3(e) + '] ' + msg);
    if (logs.length > 40) logs.length = 40;
    renderLog();
  }
  function ipc(cmd, payload) { return window.electronAPI.adb(cmd, payload); }
  function $(id) { return document.getElementById(id); }

  /* ---------- 基础操作 ---------- */
  async function detect(explicit) {
    if (!hasElectron) return { ok: false };
    const r = await ipc('detect', { path: explicit != null ? explicit : (cfg.path || '') }).catch(e => ({ ok: false, error: String(e) }));
    adbOk = !!r.ok;
    if (r.ok) { adbPath = r.path; adbVer = r.version || ''; cfg.path = r.path; calcAncient(); save(); }
    renderStatus();
    const dl = $('adb-download');
    if (dl) { dl.hidden = adbOk && !adbAncient; dl.textContent = adbAncient ? '⬇ 升级 adb' : '⬇ 下载 adb'; }
    return r;
  }

  async function downloadAdb() {
    if (!hasElectron) return;
    log('开始下载 adb（官方 platform-tools，约 6MB）…');
    const r = await ipc('download', {}).catch(e => ({ ok: false, error: String(e) }));
    if (r && r.ok) {
      log('adb 下载完成，已自动放置');
      cfg.path = '';   // 升级语义：清掉钉死的旧路径（如 PATH 上的 1.0.3x），让检测按候选顺序采用自家新版
      save();
      await detect();
      await scan();
    } else {
      log('下载失败：' + ((r && r.error) || '未知错误'));
    }
  }

  async function friendlyName(d) {
    // getprop 内置到扫描：市场名优先（如 "Xiaomi 13 Pro"），回退型号
    try {
      const r = await ipc('exec', { path: adbPath, args: ['-s', d.serial, 'shell', 'getprop ro.product.marketname; getprop ro.product.model'], timeoutMs: 5000 });
      const lines = (r.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
      return lines[0] || lines[1] || '';
    } catch (_) { return ''; }
  }

  async function scan(silent) {
    if (!adbOk) return;
    const r = await ipc('exec', { path: adbPath, args: ['devices', '-l'], timeoutMs: 8000 });
    if (!r.ok) { log('扫描失败：' + (r.stderr || r.error || '').slice(0, 80)); return; }
    const seen = new Set();
    const nameJobs = [];
    for (const line of r.stdout.split('\n')) {
      const m = line.match(/^(\S+)\s+(device|offline|unauthorized)/);   // -l 输出为空格对齐
      if (!m) continue;
      const serial = m[1], state = m[2];
      const model = (line.match(/model:(\S+)/) || [])[1];
      seen.add(serial);
      let d = devs.get(serial);
      if (!d) { d = { serial }; devs.set(serial, d); }
      Object.assign(d, { serial, state, model: model || d.model });
      const saved = cfg.devices[serial] || (cfg.devices[serial] = {});
      if (saved.name) {
        d.name = saved.name;
      } else {
        nameJobs.push(async () => { d.name = (await friendlyName(d)) || d.model || serial.slice(-4); saved.name = d.name; });
      }
      d.on = saved.on != null ? saved.on : true;
      if (state === 'device') {
        // 全量检测流水线：型号命名 → 分辨率 → 传输延迟（延迟每 60s 才重测，避免频繁打扰）
        if (!d.W) screenSize(d);
        const stale = d.L == null || !d.probedAt || (TC.time.epoch() - d.probedAt > 60000);
        if (stale) probe(d, true);
      }
    }
    for (const s of [...devs.keys()]) if (!seen.has(s) && !(devs.get(s).test)) devs.delete(s);   // cfg.devices 保留命名；test 标记的虚拟设备不清
    await Promise.all(nameJobs.map(fn => fn()));
    const sig = devsSig();
    const changed = sig !== lastSig;
    if (changed) { lastSig = sig; renderDevices(); renderChipsAll(); }
    // 自动轮询（抽屉开着每 5s）无变化时不落盘：save 会触发齐射重排，无意义的重排会撞上发射窗口
    if (changed || nameJobs.length) save();
    syncGuide();
    if (!silent || changed) log('扫描完成：' + seen.size + ' 台设备');   // 自动刷新时无变化不打日志
  }
  function devsSig() {
    return [...devs.values()].map(d => [d.serial, d.state, d.on, d.name, d.L, d.W, d.H].join(':')).join('|');
  }

  async function probe(d, silent) {
    const t = [];
    for (let i = 0; i < 3; i++) {
      const r = await ipc('exec', { path: adbPath, args: ['-s', d.serial, 'shell', 'echo tc'], timeoutMs: 5000 });
      if (!r.ok) { d.L = null; break; }
      t.push(r.durMs);
    }
    d.L = t.length === 3 ? t.sort((a, b) => a - b)[1] : null;
    d.probedAt = TC.time.epoch();
    lastSig = '';   // 强制下一轮刷新行显示
    renderDevices();
    if (!silent) log((d.name || d.serial) + ' 传输延迟 → ' + (d.L != null ? d.L + 'ms' : '测量失败'));
  }

  async function screenSize(d) {
    const r = await ipc('exec', { path: adbPath, args: ['-s', d.serial, 'shell', 'wm size'], timeoutMs: 5000 });
    if (!r.ok) return;
    const all = [...r.stdout.matchAll(/(\d+)x(\d+)/g)];
    if (all.length) { const last = all[all.length - 1]; d.W = +last[1]; d.H = +last[2]; }
  }

  async function connect(ip) {
    if (adbAncient && /^\d+(\.\d+){3}:\d+$/.test(ip)) log('⚠ adb ' + adbVer + ' 不支持 Android 11+ 无线调试（TLS 握手）——先点「⬇ 升级 adb」再连接');
    const r = await ipc('exec', { path: adbPath, args: ['connect', ip], timeoutMs: 8000 });
    log('connect ' + ip + ' → ' + ((r.stdout || r.stderr || r.error || '').trim().slice(0, 60)));
    await scan();
    const d = devs.get(ip);
    if (d && d.state === 'offline') {
      log(adbAncient
        ? '⚠ ' + ip + ' 一直离线：旧版 adb 无法完成无线调试握手——「⬇ 升级 adb」装官方最新组件后重连即可'
        : '⚠ ' + ip + ' 离线：请确认手机「无线调试」仍开启，必要时重新配对后重连');
    } else if (d && d.state === 'device') {
      log('✓ ' + ip + ' 已就绪（' + (d.name || '设备') + '）');
    }
  }

  /* ---------- 脚本生成 ---------- */
  // 选点坐标按标定设备分辨率记录，发射时按各设备实际分辨率等比缩放
  function tapXY(a, d) {
    let x = isFinite(+a.x) && a.x !== '' ? +a.x : Math.round((d.W || 1080) / 2);
    let y = isFinite(+a.y) && a.y !== '' ? +a.y : Math.round((d.H || 2340) / 2);
    if (a.shotW && d.W && d.W !== a.shotW) x = Math.round(x * d.W / a.shotW);
    if (a.shotH && d.H && d.H !== a.shotH) y = Math.round(y * d.H / a.shotH);
    return [x, y];
  }

  function genScript(a, d) {
    if (a.type === 'adv') {
      return a.script.replace(/\{serial\}/g, d.serial)
        .replace(/\{W\}/g, d.W || 1080).replace(/\{H\}/g, d.H || 2340)
        .replace(/\{X\}/g, tapXY(a, d)[0]).replace(/\{Y\}/g, tapXY(a, d)[1]);
    }
    const [x, y] = tapXY(a, d);
    const n = Math.max(1, Math.min(200, +a.n || 5));
    if (n <= 1) return `input tap ${x} ${y}`;   // 单次：不带循环与尾巴 sleep，杜绝任何多点可能
    const gap = Math.max(0.05, (+a.gap || 400) / 1000).toFixed(3);
    const loop = `for i in $(seq 1 ${n}); do input tap ${x} ${y}; sleep ${gap}; done`;
    if (a.type === 'wake') {
      const W = d.W || 1080, H = d.H || 2340;
      return `input keyevent 224; sleep 0.6; input swipe ${Math.round(W / 2)} ${Math.round(H * 0.72)} ${Math.round(W / 2)} ${Math.round(H * 0.3)} 300; sleep 1; ` + loop;
    }
    return loop;
  }

  /* ---------- 齐射调度 ---------- */
  function enabledActions() { return cfg.actions.filter(a => a.on); }
  function readyDevices() { return [...devs.values()].filter(d => d.state === 'device'); }

  // 就绪状态外发（标题栏状态灯）
  function emitState() {
    TC.bus.emit('adb:state', { enabled: cfg.enabled, ok: adbOk, ready: readyDevices().length, count: devs.size });
  }

  /* 空状态引导卡：四步就绪链（未启用 → 没装 adb → 没设备 → 无启用动作），全部完成即隐藏 */
  function renderGuide() {
    const g = $('adb-guide');
    if (!g) return;
    const rd = readyDevices();
    const unauth = [...devs.values()].some(d => d.state === 'unauthorized');
    const acts = enabledActions().length;
    const done = cfg.enabled && adbOk && rd.length > 0 && acts > 0;
    g.hidden = done;
    const step = (n, ok, txt, btn) =>
      '<div class="ag-step' + (ok ? ' ok' : '') + '"><i>' + (ok ? '✓' : n) + '</i><span>' + txt + '</span>' + (btn || '') + '</div>';
    g.innerHTML =
      '<div class="ag-title">' + (done ? '✓ ADB 齐射已就绪' : '按步骤开启 ADB 齐射') + '</div>' +
      step(1, cfg.enabled, '开启「启用 ADB 齐射」总开关') +
      step(2, adbOk, adbOk ? 'adb 组件已就绪' : '安装 adb（一键下载官方组件，约 6MB）', adbOk ? '' : '<button id="ag-dl">下载</button>') +
      step(3, rd.length > 0, rd.length ? '已连接 ' + rd.length + ' 台设备' : 'USB 连接手机并开启 USB 调试', rd.length ? '' : '<button id="ag-scan">扫描</button>') +
      step(4, acts > 0, acts ? '已启用 ' + acts + ' 个动作' : '添加动作并勾选「启用」') +
      (unauth ? '<div class="ag-warn">检测到未授权设备：请在手机上允许「USB 调试」弹窗，再点扫描</div>' : '') +
      '<div class="ag-note">不需要 ADB？保持总开关关闭即可，TIMECORE 仍是完整的纯时间装置</div>';
    const dl = $('ag-dl');
    if (dl) dl.addEventListener('click', downloadAdb);
    const sc = $('ag-scan');
    if (sc) sc.addEventListener('click', () => (adbOk ? scan() : detect()));
    const dot = $('adb-dot');
    if (dot) dot.style.background = !cfg.enabled ? '#777' : rd.length ? '#4dffa6' : adbOk ? '#39d7ff' : '#ffb347';
  }
  function syncGuide() { renderGuide(); emitState(); }
  function targetsOf(a) {
    const en = [...devs.values()].filter(d => d.on && d.state === 'device');
    return (a.devs && a.devs.length) ? en.filter(d => a.devs.includes(d.serial)) : en;
  }
  function wakeFor(a, d) {
    const lead = isFinite(+a.lead) && a.lead !== '' ? +a.lead : (+cfg.leadMs || 0);
    return Math.max(0, lead) + (cfg.cal && d.L != null ? d.L : 0);
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; armed = false; refreshArmedBtn(); }

  // 配置变更后重排：取消未发射的定时器，按最新配置重新布防（执行中的脚本进程不受影响）
  let rearmTimer = 0;
  function scheduleRearm() {
    if (!hasElectron) return;
    clearTimeout(rearmTimer);
    rearmTimer = setTimeout(() => {
      const info = TC.Countdown.info();
      if (info.armed && !info.fired) arm(info.target, true);
    }, 300);
  }

  // node 为绝对 epoch（倒计时的 target 节点）；quiet = 重排不打日志
  function arm(node, quiet) {
    clearTimers();
    if (node !== lastArmNode) { spawnedKeys.clear(); lastArmNode = node; }   // 新节点才清发射记录；同节点重排要靠它防双发
    if (!hasElectron || !cfg.enabled) return;
    if (!adbOk) { if (enabledActions().length) log('⚠ adb 不可用，齐射未布防'); return; }
    const now = TC.time.epoch();
    plannedN = 0;
    let skipped = 0;
    for (const a of enabledActions()) {
      for (const d of targetsOf(a)) {
        const fireAt = node - wakeFor(a, d);
        if (fireAt <= now + 30) { skipped++; continue; }   // 已过节点不补发
        // 预发射模式提前 PRESPAWN_MS 拉起进程；发射窗口内发生的重排会立即拉起——靠 fireOne 去重防双发
        const spawnAt = cfg.precise ? Math.max(now + 40, fireAt - PRESPAWN_MS) : Math.max(now + 40, fireAt);
        timers.push(setTimeout(() => fireOne(a, d, node), spawnAt - now));
        plannedN++;
      }
    }
    armed = plannedN > 0;
    if (armed && !quiet) log('⚡ 布防 ' + plannedN + ' 路发射 → 节点 ' + TC.Clock.wallClock(node) + '.' + pad3(node) + (cfg.dry ? '（演练）' : ''));
    refreshArmedBtn();
  }

  // 发射闸门：同一「动作×设备×倒计时节点」只允许真正拉起一次 adb 进程。
  // 键必须用 node 而非 fireAt：fireAt 依赖设备延迟 L，扫描重测延迟会改变它从而绕过去重 → 双发
  function fireOne(a, d, node) {
    const key = a.id + ':' + d.serial + ':' + node;
    if (spawnedKeys.has(key)) return;
    spawnedKeys.add(key);
    if (cfg.precise) spawnPrecise(a, d, lastArmNode - wakeFor(a, d)); else spawnSimple(a, d);
  }

  function spawnSimple(a, d) {
    const s = genScript(a, d);
    if (cfg.dry) { log('【演练】→ ' + (d.name || d.serial) + '：' + s.slice(0, 70)); return; }
    runScript(d, s, '⚡');
  }

  function spawnPrecise(a, d, fireAt) {
    const now = TC.time.epoch();
    const halfL = (cfg.cal && d.L != null) ? d.L / 2 : 0;
    const sleepS = Math.max(0, (fireAt - (now + halfL)) / 1000);
    const s = (sleepS > 0.03 ? 'sleep ' + sleepS.toFixed(3) + '\n' : '') + genScript(a, d);
    if (cfg.dry) { log('【演练·预发射】→ ' + (d.name || d.serial) + ' sleep=' + sleepS.toFixed(3) + 's：' + genScript(a, d).slice(0, 50)); return; }
    runScript(d, s, '⚡预');
  }

  async function runScript(d, script, tag) {
    const r = await ipc('exec', { path: adbPath, args: ['-s', d.serial, 'shell', script], timeoutMs: 90000 });
    log(tag + ' ' + (d.name || d.serial) + ' → ' + (r.ok ? '完成 ' + r.durMs + 'ms' : '失败 ' + ((r.stderr || r.error || '').trim().slice(0, 60) || ('exit ' + r.code))));
    return r;
  }

  async function testFire(a) {
    const ts = targetsOf(a);
    if (!ts.length) { log('「' + a.name + '」没有可用设备（先扫描并勾选）'); return; }
    if (cfg.dry) { ts.forEach(d => spawnSimple(a, d)); return; }
    for (const d of ts) runScript(d, genScript(a, d), '试射');
    log('试射「' + a.name + '」→ ' + ts.length + ' 台设备');
  }

  /* ---------- 截图选点 ---------- */
  async function pickPoint(a, open) {
    const d = targetsOf(a)[0] || [...devs.values()].find(x => x.state === 'device');
    if (!d) { log('「' + a.name + '」没有在线设备，无法截屏选点'); return; }
    const r = await ipc('exec', { path: adbPath, args: ['-s', d.serial, 'exec-out', 'screencap', '-p'], timeoutMs: 15000, binary: true });
    if (!r.ok || !r.b64 || r.b64.length < 100) { log('截屏失败：' + ((r.stderr || r.error || '').trim().slice(0, 60) || '图像为空')); return; }
    a._shot = r.b64;
    a.shotW = d.W || 1080; a.shotH = d.H || 2340;
    if (a.x === '' || !isFinite(+a.x) || a.y === '' || !isFinite(+a.y)) { a.x = Math.round(a.shotW / 2); a.y = Math.round(a.shotH / 2); }
    renderActions();
    log('已截取 ' + (d.name || d.serial) + ' 屏幕，点击截图选点');
    if (open) openPicker(a);
  }

  /* ---------- 大图选点浮层 ---------- */
  let pickA = null;

  function openPicker(a) {
    if (!a._shot) { pickPoint(a, true); return; }
    pickA = a;
    $('sp-title').textContent = '选点 · ' + (a.name || '') + ' · ' + a.shotW + '×' + a.shotH;
    $('sp-img').src = 'data:image/png;base64,' + a._shot;
    $('sp-xy').textContent = xyText(a);
    const cr = $('sp-cross');
    const css = crossStyle(a);
    cr.style.cssText = css;
    cr.hidden = !css;
    $('shot-picker').hidden = false;
    layoutFrame();
  }

  // 按截图真实宽高比显式计算显示框尺寸：杜绝 CSS 百分比约束失效导致的拉伸变形
  function layoutFrame() {
    if (!pickA) return;
    const stage = $('sp-stage').getBoundingClientRect();
    const availW = Math.max(50, stage.width - 8), availH = Math.max(50, stage.height - 8);
    const ar = pickA.shotW / pickA.shotH;
    let w = availW, h = w / ar;
    if (h > availH) { h = availH; w = h * ar; }
    const frame = $('sp-img').parentElement;
    frame.style.width = Math.round(w) + 'px';
    frame.style.height = Math.round(h) + 'px';
  }

  function closePicker() {
    $('shot-picker').hidden = true;
    $('sp-mag').style.display = 'none';
    pickA = null;
    renderActions();
  }

  function xyText(a) {
    return (isFinite(+a.x) && a.x !== '' ? a.x : '—') + ' , ' + (isFinite(+a.y) && a.y !== '' ? a.y : '—');
  }

  function wirePicker() {
    const img = $('sp-img'), mag = $('sp-mag');
    const guides = $('sp-guides'), gv = guides.querySelector('.gv'), gh = guides.querySelector('.gh');
    img.addEventListener('dragstart', e => e.preventDefault());   // 原生图片拖拽会吞掉 click
    window.addEventListener('resize', () => layoutFrame());
    img.addEventListener('mousemove', e => {
      if (!pickA) return;
      const rect = img.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const rx = TC.clamp(px / rect.width, 0, 1);
      const ry = TC.clamp(py / rect.height, 0, 1);
      $('sp-xy').textContent = Math.round(rx * pickA.shotW) + ' , ' + Math.round(ry * pickA.shotH);
      guides.hidden = false;
      gv.style.left = px + 'px';
      gh.style.top = py + 'px';
      // ×3 放大镜：源区域 = 视窗/3
      const Z = 3, S = 160;
      const natW = img.naturalWidth, natH = img.naturalHeight;
      const sx = TC.clamp(rx * natW - S / (2 * Z), 0, Math.max(0, natW - S / Z));
      const sy = TC.clamp(ry * natH - S / (2 * Z), 0, Math.max(0, natH - S / Z));
      const ctx = mag.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, S / Z, S / Z, 0, 0, S, S);
      ctx.strokeStyle = 'rgba(255,93,122,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
      const stage = img.parentElement.getBoundingClientRect();
      mag.style.display = 'block';
      mag.style.left = TC.clamp(e.clientX - stage.left + 22, 0, stage.width - S) + 'px';
      mag.style.top = TC.clamp(e.clientY - stage.top - S / 2, 0, stage.height - S) + 'px';
    });
    img.addEventListener('mouseleave', () => { mag.style.display = 'none'; guides.hidden = true; });
    img.addEventListener('click', e => {
      if (!pickA) return;
      const rect = img.getBoundingClientRect();
      pickA.x = Math.round((e.clientX - rect.left) * (pickA.shotW / rect.width));
      pickA.y = Math.round((e.clientY - rect.top) * (pickA.shotH / rect.height));
      save();
      $('sp-xy').textContent = xyText(pickA);
      const cr = $('sp-cross');
      cr.style.cssText = crossStyle(pickA);
      cr.hidden = false;
      cr.classList.remove('pulse'); void cr.offsetWidth; cr.classList.add('pulse');
      guides.hidden = true;
      log('「' + pickA.name + '」选点 → ' + pickA.x + ',' + pickA.y);
    });
    $('sp-close').addEventListener('click', closePicker);
    $('sp-ok').addEventListener('click', closePicker);
    $('sp-retake').addEventListener('click', () => { if (pickA) pickPoint(pickA, true); });
    $('shot-picker').addEventListener('click', e => { if (e.target === $('shot-picker')) closePicker(); });
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !$('shot-picker').hidden) { closePicker(); e.stopPropagation(); }
    }, true);
  }

  /* ---------- 倒计时联动 ---------- */
  TC.bus.on('cd:start', i => {
    if (!hasElectron) return;
    (async () => { if (adbOk && devs.size) await scan(true); arm(i.target); })();
  });
  const haltAll = () => { clearTimers(); spawnedKeys.clear(); };   // 停止/完成：定时器与发射记录全部作废
  TC.bus.on('cd:advance', () => { if (hasElectron) arm(TC.Countdown.info().target); });
  TC.bus.on('cd:stop', haltAll);
  TC.bus.on('cd:done', haltAll);
  TC.bus.on('cd:zero', () => {
    if (hasElectron && armed && plannedN) TC.UI.toast('⚡ ADB 齐射 ' + plannedN + ' 路' + (cfg.dry ? '（演练）' : '已派出'));
  });

  /* ---------- 面板 ---------- */
  const el = {};

  function renderStatus() {
    const s = $('adb-status');
    if (!s) return;
    if (adbOk && adbAncient) {
      s.textContent = '⚠ adb ' + (adbVer || '') + '（版本过旧）——USB 可用，但 Android 11+ 无线调试无法握手。点「⬇ 升级 adb」安装官方最新组件';
      s.style.color = 'var(--warm)';
    } else {
      s.textContent = adbOk ? '✓ adb ' + (adbVer || '') + ' · ' + adbPath : '✗ 未找到 adb —— 安装 platform-tools 或手动填写路径后点「检测」';
      s.style.color = adbOk ? '#4dffa6' : 'var(--warm)';
    }
    refreshArmedBtn();
    syncGuide();
  }

  function devRow(d) {
    const row = document.createElement('div');
    row.className = 'adb-dev' + (d.state === 'device' ? '' : ' off');
    const st = d.state === 'device' ? '' : (d.state === 'unauthorized' ? '未授权' : '离线');
    row.innerHTML =
      '<i class="dot" style="background:' + (d.state === 'device' ? '#4dffa6' : '#ff5d7a') + '"></i>' +
      '<input class="d-name" value="' + (d.name || '').replace(/"/g, '') + '" title="设备名称">' +
      '<span class="d-serial" title="' + d.serial + '">' + (st || d.serial) + '</span>' +
      '<span class="d-lat" title="传输延迟（echo 往返中位）">' + (d.L != null ? d.L + 'ms' : '—') + '</span>' +
      '<button class="d-cal" title="测量传输延迟">校</button>' +
      '<button class="d-tap" title="点一下屏幕中心（测试）">点</button>' +
      '<label class="ck-inline" title="参与齐射"><input type="checkbox" class="d-on"' + (d.on ? ' checked' : '') + '></label>';
    row.querySelector('.d-name').addEventListener('change', e => { d.name = e.target.value.trim() || d.serial; cfg.devices[d.serial].name = d.name; save(); renderChipsAll(); });
    row.querySelector('.d-on').addEventListener('change', e => { d.on = e.target.checked; cfg.devices[d.serial].on = d.on; save(); renderChipsAll(); });
    row.querySelector('.d-cal').addEventListener('click', () => probe(d));
    row.querySelector('.d-tap').addEventListener('click', () => {
      if (cfg.dry) { log('【演练】→ ' + (d.name || d.serial) + '：input tap 屏幕中心'); return; }
      runScript(d, 'input tap ' + Math.floor((d.W || 1080) / 2) + ' ' + Math.floor((d.H || 2340) / 2), '点测');
    });
    return row;
  }

  function grayRow(serial, sv) {
    const row = document.createElement('div');
    row.className = 'adb-dev off';
    // 灰色行（未连接设备）也用垃圾桶图标
    row.innerHTML =
      '<i class="dot" style="background:#555"></i>' +
      '<input class="d-name" value="' + (sv.name || '').replace(/"/g, '') + '" title="设备名称">' +
      '<span class="d-serial" title="' + serial + '">未连接</span>' +
      '<label class="ck-inline" title="连接后参与齐射"><input type="checkbox" class="d-on"' + (sv.on ? ' checked' : '') + '></label>';
    row.querySelector('.d-name').addEventListener('change', e => { sv.name = e.target.value.trim() || serial; save(); renderChipsAll(); });
    row.querySelector('.d-on').addEventListener('change', e => { sv.on = e.target.checked; save(); });
    return row;
  }

  function renderDevices() {
    const box = $('adb-devices');
    if (!box) return;
    box.innerHTML = '';
    for (const d of devs.values()) box.appendChild(devRow(d));
    for (const [serial, sv] of Object.entries(cfg.devices)) {
      if (!devs.has(serial)) box.appendChild(grayRow(serial, sv));   // 离线设备保留命名
    }
    if (!devs.size && !Object.keys(cfg.devices).length) {
      box.innerHTML = '<div class="dim small" style="padding:4px 2px">尚未发现设备 —— 手机开启 USB 调试并连接后自动出现</div>';
    }
    syncGuide();
  }

  function chipsHTML(a) {
    const list = [...devs.values()];
    if (!list.length) return '<span class="dim small">无设备</span>';
    return list.map(d => {
      const sel = a.devs.includes(d.serial);
      const off = d.state !== 'device';
      return '<span class="a-devchip' + (sel ? ' on' : '') + (off ? ' dimchip' : '') + '" data-serial="' + d.serial + '" title="' + d.serial + (off ? '（离线）' : '') + '">' + (d.name || d.serial.slice(-4)) + '</span>';
    }).join('');
  }

  function renderChipsAll() {
    document.querySelectorAll('.adb-action').forEach(card => {
      const a = cfg.actions.find(x => x.id === card.dataset.id);
      if (!a) return;
      const box = card.querySelector('.a-devices');
      if (box) { box.innerHTML = chipsHTML(a); bindChips(box, a); }
      const cnt = card.querySelector('.a-devcount');
      if (cnt) cnt.textContent = a.devs.length ? '指定 ' + a.devs.length + ' 台' : '全部启用设备';
    });
  }
  function bindChips(box, a) {
    box.querySelectorAll('.a-devchip').forEach(ch => ch.addEventListener('click', () => {
      const s = ch.dataset.serial;
      a.devs = a.devs.includes(s) ? a.devs.filter(x => x !== s) : a.devs.concat(s);
      save(); renderChipsAll();
    }));
  }

  function crossStyle(a) {
    if (!isFinite(+a.x) || a.x === '' || !a.shotW) return '';
    return 'left:' + (a.x / a.shotW * 100).toFixed(2) + '%;top:' + (a.y / a.shotH * 100).toFixed(2) + '%';
  }

  function actionCard(a) {
    const card = document.createElement('div');
    card.className = 'adb-action';
    card.dataset.id = a.id;
    const badge = { tap: '连点', wake: '亮屏连点', adv: '脚本' }[a.type] || '动作';
    const isAdv = a.type === 'adv';

    let body = '';
    if (isAdv) {
      body = '<textarea class="a-script" rows="3" spellcheck="false" placeholder="设备端 shell 脚本，支持 {serial} {W} {H} {X} {Y}"></textarea>';
    } else {
      body =
        '<div class="a-pick">' +
          '<div class="a-shot">' +
            (a._shot ? '<img src="data:image/png;base64,' + a._shot + '"><i class="a-cross" style="' + crossStyle(a) + '"></i>' : '<div class="a-shot-empty dim small">尚未截屏</div>') +
          '</div>' +
          '<div class="a-pick-ctl">' +
            '<button class="a-shotbtn">' + (a._shot ? '📸 重新截屏' : '📸 截屏选点') + '</button>' +
            '<div class="a-field"><span class="a-lab">X 坐标</span><input type="number" class="a-x"></div>' +
            '<div class="a-field"><span class="a-lab">Y 坐标</span><input type="number" class="a-y"></div>' +
            '<div class="a-field"><span class="a-lab">次数</span><input type="number" class="a-n" min="1" max="200"></div>' +
            '<div class="a-field"><span class="a-lab">间隔 ms</span><input type="number" class="a-gap" min="50"></div>' +
            (a.type === 'wake' ? '<div class="dim small">先亮屏+上滑解锁（需无密码锁屏）</div>' : '') +
          '</div>' +
        '</div>';
    }

    card.innerHTML =
      '<div class="row"><span class="a-badge">' + badge + '</span><input class="a-name" value="' + (a.name || '').replace(/"/g, '') + '" placeholder="动作名称">' +
      '<label class="ck-inline"><input type="checkbox" class="a-on"' + (a.on ? ' checked' : '') + '>启用</label>' +
      '<button class="a-del" title="删除此动作"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></div>' +
      body +
      '<div class="a-devices">' + chipsHTML(a) + '</div>' +
      '<div class="a-field"><span class="a-lab">提前量</span><input type="number" class="a-lead" placeholder="用全局"><span class="dim small">ms</span></div>' +
      '<div class="row"><span class="dim small a-devcount">' + (a.devs.length ? '指定 ' + a.devs.length + ' 台' : '全部启用设备') + '</span>' +
      '<span style="flex:1"></span><button class="a-fire">试射</button></div>';

    card.querySelector('.a-name').addEventListener('input', e => { a.name = e.target.value; save(); });
    card.querySelector('.a-on').addEventListener('change', e => { a.on = e.target.checked; save(); });
    card.querySelector('.a-del').addEventListener('click', () => { cfg.actions = cfg.actions.filter(x => x !== a); save(); renderActions(); });
    card.querySelector('.a-fire').addEventListener('click', () => testFire(a));
    card.querySelector('.a-lead').value = a.lead != null ? a.lead : '';
    card.querySelector('.a-lead').addEventListener('input', e => { a.lead = e.target.value === '' ? '' : +e.target.value; save(); });
    bindChips(card.querySelector('.a-devices'), a);

    if (isAdv) {
      const ta = card.querySelector('.a-script');
      ta.value = a.script || '';
      ta.addEventListener('input', e => { a.script = e.target.value; save(); });
    } else {
      card.querySelector('.a-shotbtn').addEventListener('click', () => pickPoint(a, true));
      const xi = card.querySelector('.a-x'), yi = card.querySelector('.a-y');
      xi.value = isFinite(+a.x) && a.x !== '' ? a.x : '';
      yi.value = isFinite(+a.y) && a.y !== '' ? a.y : '';
      xi.addEventListener('input', e => { a.x = e.target.value === '' ? '' : +e.target.value; save(); updateCross(card, a); });
      yi.addEventListener('input', e => { a.y = e.target.value === '' ? '' : +e.target.value; save(); updateCross(card, a); });
      const ni = card.querySelector('.a-n'), gi = card.querySelector('.a-gap');
      ni.value = a.n || 5; gi.value = a.gap || 400;
      ni.addEventListener('input', e => { a.n = +e.target.value || 5; save(); });
      gi.addEventListener('input', e => { a.gap = +e.target.value || 400; save(); });
      const shotBox = card.querySelector('.a-shot');
      const openBig = () => openPicker(a);
      if (shotBox.querySelector('img')) shotBox.querySelector('img').addEventListener('click', openBig);
      else shotBox.addEventListener('click', openBig);
    }
    return card;
  }

  function updateCross(card, a) {
    const cr = card.querySelector('.a-cross');
    if (cr) cr.style.cssText = crossStyle(a);
  }

  function renderActions() {
    const box = $('adb-actions');
    if (!box) return;
    box.innerHTML = '';
    for (const a of cfg.actions) box.appendChild(actionCard(a));
    syncGuide();
  }

  function renderLog() {
    const box = $('adb-log');
    if (box) box.textContent = logs.join('\n') || '— 暂无记录 —';
  }

  function refreshArmedBtn() {
    const b = $('btn-adb');
    if (b) {
      b.classList.toggle('armed', cfg.enabled && (armed || (adbOk && enabledActions().length > 0)));
      b.classList.toggle('off', !cfg.enabled);
    }
  }

  // 总开关：停用 = 不扫描、不布防、不发射、不拉起 adb；动作配置保留
  function setEnabled(v) {
    cfg.enabled = !!v;
    save();
    if (!cfg.enabled) {
      haltAll();
    } else if (hasElectron) {
      detect().then(() => { if (adbOk && devs.size) scan(); });
      const info = TC.Countdown.info();
      if (info.armed) arm(info.target);
    }
    renderEnabledState();
    log('ADB 齐射已' + (cfg.enabled ? '启用' : '停用（不扫描、不发射）'));
  }

  function renderEnabledState() {
    const cb = $('adb-enabled');
    if (cb) cb.checked = cfg.enabled;
    const dr = $('adb-drawer');
    if (dr) dr.dataset.on = cfg.enabled ? '1' : '0';   // 未启用时抽屉整体置灰（引导卡除外）
    refreshArmedBtn();
    syncGuide();
  }

  function newAction(type) {
    const base = { id: 'a' + Date.now() + Math.floor(Math.random() * 100), name: '', lead: '', devs: [], on: true };
    if (type === 'tap') return Object.assign(base, { type: 'tap', name: '连点', x: '', y: '', n: 5, gap: 400 });
    if (type === 'wake') return Object.assign(base, { type: 'wake', name: '亮屏连点', x: '', y: '', n: 3, gap: 500 });
    return Object.assign(base, { type: 'adv', name: '自定义脚本', script: 'input tap {X} {Y}' });
  }

  function seedTapAction() {
    return { id: 'a' + Date.now(), type: 'tap', name: '连点示例 · 右下 (864,2280)', x: 864, y: 2280, n: 5, gap: 400, lead: '', devs: [], on: false };
  }

  function resetActions() {
    if (!confirm('恢复默认示例动作？当前动作列表会被清空。')) return;
    cfg.actions = [seedTapAction()];
    save(); renderActions();
    log('已恢复默认示例动作');
  }

  function wire() {
    $('btn-adb').addEventListener('click', () => {
      $('drawer').classList.remove('open');
      const d = $('adb-drawer');
      const open = d.classList.toggle('open');
      if (open && !adbOk && cfg.enabled && hasElectron) detect();
    });
    $('adb-close').addEventListener('click', () => $('adb-drawer').classList.remove('open'));
    $('adb-enabled').addEventListener('change', e => setEnabled(e.target.checked));
    $('adb-download').addEventListener('click', downloadAdb);
    $('adb-detect').addEventListener('click', () => detect($('adb-path').value.trim()));
    $('adb-scan').addEventListener('click', () => adbOk ? scan() : detect());
    $('adb-connect-btn').addEventListener('click', () => {
      const ip = $('adb-connect').value.trim();
      if (ip) adbOk ? connect(ip) : log('先检测 adb');
    });
    $('adb-add').addEventListener('click', () => {
      cfg.actions.push(newAction($('adb-add-type').value || 'tap'));
      save(); renderActions();
    });
    $('adb-reset').addEventListener('click', resetActions);
    $('adb-lead').value = cfg.leadMs;
    $('adb-lead').addEventListener('input', e => { cfg.leadMs = +e.target.value || 0; save(); });
    $('adb-cal').checked = cfg.cal;
    $('adb-cal').addEventListener('change', e => { cfg.cal = e.target.checked; save(); });
    $('adb-precise').checked = cfg.precise;
    $('adb-precise').addEventListener('change', e => { cfg.precise = e.target.checked; save(); });
    $('adb-dry').checked = cfg.dry;
    $('adb-dry').addEventListener('change', e => { cfg.dry = e.target.checked; save(); log('演练模式 ' + (cfg.dry ? '开启（只记日志不执行）' : '关闭')); });
    $('adb-path').value = cfg.path || '';
    renderEnabledState();
    renderStatus(); renderDevices(); renderActions(); renderLog(); refreshArmedBtn();
    wirePicker();
    if (hasElectron) {
      if (cfg.enabled) detect();
      // 设备自动刷新：启用且抽屉打开或已布防时每 5 秒静默扫描
      setInterval(() => { if (cfg.enabled && ($('adb-drawer').classList.contains('open') || armed)) scan(true); }, 5000);
    }
  }

  TC.bus.on('boot', () => {
    if (!cfg.seeded) {
      cfg.actions.push(seedTapAction());
      cfg.seeded = true;
      save();
    }
    wire();
  });

  /* ---------- 调试接口 ---------- */
  TC.ADB = {
    debug() { return { adbOk, adbPath, adbVer, adbAncient, enabled: cfg.enabled, armed, plannedN, spawnedN: spawnedKeys.size, pending: timers.length, cfg, devices: [...devs.values()], logs: logs.slice(0, 12) }; },
    // 测试钩子：注入模拟在线设备（配合演练模式做确定性回归；test 标记使其免疫扫描清理，永不参与真实发射）
    _dev(serial) {
      const d = { serial, name: '模拟机', state: 'device', model: 'TEST', L: 100, W: 1080, H: 2340, on: true, probedAt: TC.time.epoch(), test: true };
      devs.set(serial, d);
      cfg.devices[serial] = cfg.devices[serial] || { name: d.name, on: true };
      renderDevices();
      return d;
    },
    detect, scan, testFire, arm, pickPoint, openPicker, setEnabled,
    dry(v) { cfg.dry = !!v; save(); }
  };
})();
