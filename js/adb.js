/* ADB 齐射：倒计时到点瞬间向多台安卓设备分发动作（仅 Windows 桌面端）
 * 动作 = 模板（连点 / 亮屏再点 / 高级脚本）；选点 = 设备截图上点一下
 * 时间补偿三层：全局提前量 + 每设备传输延迟校准 + 预发射（设备端 sleep 对齐） */
(function () {
  const hasElectron = !!window.electronAPI;
  const adbExecutor = hasElectron ? globalThis.TimeCoreDomain.createAdbExecutor(window.electronAPI) : null;

  // enabled 默认关：首次使用先引导配置（老用户的已存值以 tc.adb.v1 为准，不受影响）
  // leadMs 默认 100（2026-09 调整，旧默认 300；仅影响新用户，老用户保留已存值）
  const configStore = globalThis.TimeCoreDomain.createAdbConfigStore({
    defaults: { path: '', leadMs: 100, cal: true, precise: true, comp: true, dry: false, enabled: false, seeded: false, devices: {}, actions: [] }
  });
  let cfg = configStore.load();
  const actionCatalog = globalThis.TimeCoreDomain.createAdbActionCatalog(cfg.actions);
  // 保留旧的 TC.ADB.debug().cfg.actions 读写契约；动作状态由 Catalog 统一归一化。
  Object.defineProperty(cfg, 'actions', {
    configurable: true,
    enumerable: true,
    get: () => actionCatalog.list(),
    set: value => { actionCatalog.replace(value); }
  });
  const actionView = globalThis.TimeCoreDomain.createAdbActionView();
  const deviceView = globalThis.TimeCoreDomain.createAdbDeviceView();
  const guideView = globalThis.TimeCoreDomain.createAdbGuideView();
  let screenshotPicker = null;
  let screenshotController = null;
  let actionController = null;
  let availabilityController = null;
  let lifecycleController = null;
  let connectionController = null;
  const deviceRegistry = globalThis.TimeCoreDomain.createAdbDeviceRegistry({ saved: cfg.devices });
  const logs = [];
  const schedulePlanner = {
    plan(node, now, lanes) {
      return globalThis.TimeCoreDomain.createActionTimeline({ precise: cfg.precise }).plan(node, now, lanes);
    }
  };
  const scheduleCoordinator = globalThis.TimeCoreDomain.createAdbScheduleCoordinator({
    planner: schedulePlanner,
    gate: globalThis.TimeCoreDomain.createAdbEmissionGate()
  });
  const scriptBuilder = globalThis.TimeCoreDomain.createAdbScriptBuilder();
  const scanCoordinator = globalThis.TimeCoreDomain.createAdbScanCoordinator({
    registry: deviceRegistry,
    tasks: {
      resolveName: (_serial, device) => friendlyName(device),
      measureScreenSize: serial => screenSize(serial),
      probe: (serial, _device, silent) => probe(serial, silent)
    }
  });
  const scanController = globalThis.TimeCoreDomain.createAdbScanController({
    executor: adbExecutor,
    coordinator: scanCoordinator,
    isAvailable: () => availabilityState().ok,
    getPath: () => availabilityState().path,
    nowEpoch: () => TC.time.epoch(),
    onChanged: () => { renderDevices(); renderChipsAll(); },
    onPersist: save,
    onGuide: syncGuide,
    onLog: log
  });

  function deviceSnapshot() { return deviceRegistry.snapshot(); }
  function syncCfgDevices() { cfg.devices = deviceSnapshot().saved; }

  function save() {
    syncCfgDevices();
    // 合并式保存：离线/拔出设备的命名保留，不被重建清掉
    configStore.save(cfg, actionCatalog.serialize());
    refreshArmedBtn();
    scheduleRearm();   // 任何配置变更 → 去抖重排，倒计时进行中即时生效
  }
  availabilityController = globalThis.TimeCoreDomain.createAdbAvailabilityController({
    executor: adbExecutor || {
      detect: async () => ({ ok: false }),
      download: async () => ({ ok: false })
    },
    initial: { path: cfg.path || '', ok: false, version: '', ancient: false },
    isSupported: () => hasElectron,
    setPath: path => { cfg.path = path; },
    persist: save,
    render: renderStatus,
    scan: () => scan(),
    log
  });
  function availabilityState() { return availabilityController.state(); }
  function lifecycleState() { return lifecycleController.state(); }
  function pad3(ms) { return String(Math.floor(((ms % 1000) + 1000) % 1000)).padStart(3, '0'); }
  function log(msg) {
    const e = TC.time.epoch();
    logs.unshift('[' + TC.Clock.wallClock(e, 'local') + '.' + pad3(e) + '] ' + msg);
    if (logs.length > 40) logs.length = 40;
    renderLog();
  }
  function $(id) { return document.getElementById(id); }
  const fireController = hasElectron ? globalThis.TimeCoreDomain.createAdbFireController({
    executor: adbExecutor,
    scriptBuilder,
    clock: TC.time,
    logger: { log }
  }) : null;

  /* ---------- 基础操作 ---------- */
  function detect(explicit) { return availabilityController.detect(explicit); }
  function downloadAdb() { return availabilityController.download(); }

  async function friendlyName(d) {
    // getprop 内置到扫描：市场名优先（如 "Xiaomi 13 Pro"），回退型号
    try {
      const r = await adbExecutor.exec(availabilityState().path, ['-s', d.serial, 'shell', 'getprop ro.product.marketname; getprop ro.product.model'], { timeoutMs: 5000 });
      const lines = (r.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
      return lines[0] || lines[1] || '';
    } catch (_) { return ''; }
  }

  function scan(silent) { return scanController.scan(!!silent); }

  async function probe(serial, silent) {
    const d = deviceRegistry.get(serial);
    if (!d) return;
    const t = [];
    for (let i = 0; i < 3; i++) {
      const r = await adbExecutor.exec(availabilityState().path, ['-s', d.serial, 'shell', 'echo tc'], { timeoutMs: 5000 });
      if (!r.ok) { deviceRegistry.update(serial, { L: null }); break; }
      t.push(r.durMs);
    }
    const latency = t.length === 3 ? t.sort((a, b) => a - b)[1] : null;
    const patch = { L: latency, probedAt: TC.time.epoch() };
    // input 命令开销（无参调用走 usage 退出的同一条 app_process 启动路径，不产生点击）
    // RTT(input) − RTT(echo) ≈ 单次点击的命令执行开销，用于间隔补偿
    if (latency != null) {
      const ti = [];
      for (let i = 0; i < 3; i++) {
        const r = await adbExecutor.exec(availabilityState().path, ['-s', d.serial, 'shell', 'input'], { timeoutMs: 5000 });
        if (r.durMs != null) ti.push(r.durMs);
      }
      if (ti.length === 3) {
        const med = ti.sort((a, b) => a - b)[1];
        patch.TI = Math.max(0, Math.min(1000, med - latency));
      }
    }
    deviceRegistry.update(serial, patch);
    const current = deviceRegistry.get(serial) || d;
    scanController.invalidate();   // 强制下一轮刷新行显示
    renderDevices();
    if (!silent) log((current.name || current.serial) + ' 传输延迟 → ' + (current.L != null ? current.L + 'ms' : '测量失败') + (current.TI != null ? ' · 点击开销 ' + current.TI + 'ms' : ''));
  }

  async function screenSize(serial) {
    const d = deviceRegistry.get(serial);
    if (!d) return;
    const r = await adbExecutor.exec(availabilityState().path, ['-s', d.serial, 'shell', 'wm size'], { timeoutMs: 5000 });
    if (!r.ok) return;
    const all = [...r.stdout.matchAll(/(\d+)x(\d+)/g)];
    if (all.length) { const last = all[all.length - 1]; deviceRegistry.update(serial, { W: +last[1], H: +last[2] }); }
  }

  connectionController = hasElectron ? globalThis.TimeCoreDomain.createAdbConnectionController({
    executor: adbExecutor,
    availability: availabilityState,
    scan,
    device: serial => deviceRegistry.get(serial),
    log
  }) : null;
  function connect(ip) { return connectionController ? connectionController.connect(ip) : Promise.resolve(); }

  /* ---------- 脚本生成 ---------- */
  // cfg 只在 Adapter 转成纯脚本策略参数，设备扫描、DOM 与 IPC 不进入 Domain。
  function genScript(a, d) {
    return scriptBuilder.build(a, d, { compensate: !!cfg.comp });
  }

  /* ---------- 齐射调度 ---------- */
  function enabledActions() { return actionCatalog.enabled(); }
  function readyDevices() { return deviceSnapshot().devices.filter(d => d.state === 'device'); }

  // 就绪状态外发（标题栏状态灯）
  function emitState() {
    TC.bus.emit('adb:state', { enabled: lifecycleState().enabled, ok: availabilityState().ok, ready: readyDevices().length, count: deviceSnapshot().devices.length });
  }

  function handleGuideViewEvent(event) {
    if (event.kind === 'download') void downloadAdb();
    else if (event.kind === 'scan') void (availabilityState().ok ? scan() : detect());
  }

  /* 空状态引导卡：状态由 Controller 计算，DOM/按钮只由 View 承接。 */
  function syncGuide() {
    const availability = availabilityState();
    const snapshot = deviceSnapshot();
    guideView.render({
      enabled: lifecycleState().enabled,
      adbOk: availability.ok,
      adbAncient: availability.ancient,
      adbVersion: availability.version,
      adbPath: availability.path,
      readyCount: snapshot.devices.filter(d => d.state === 'device').length,
      actionCount: enabledActions().length,
      unauthorized: snapshot.devices.some(d => d.state === 'unauthorized')
    }, { onEvent: handleGuideViewEvent });
    emitState();
  }
  function targetsOf(a) {
    const en = deviceSnapshot().devices.filter(d => d.on && d.state === 'device');
    return (a.devs && a.devs.length) ? en.filter(d => a.devs.includes(d.serial)) : en;
  }
  function wakeFor(a, d) {
    const lead = isFinite(+a.lead) && a.lead !== '' ? +a.lead : (+cfg.leadMs || 0);
    return Math.max(0, lead) + (cfg.cal && d.L != null ? d.L : 0);
  }
  function clearSchedule() { scheduleCoordinator.clear(); refreshArmedBtn(); }

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
    if (!hasElectron || !lifecycleState().enabled) { scheduleCoordinator.reset(); refreshArmedBtn(); return; }
    if (!availabilityState().ok) { clearSchedule(); if (enabledActions().length) log('⚠ adb 不可用，齐射未布防'); return; }
    const now = TC.time.epoch();
    const lanes = [];
    const refs = new Map();
    for (const a of enabledActions()) {
      for (const d of targetsOf(a)) {
        lanes.push({
          actionId: a.id,
          deviceId: d.serial,
          offsetMs: isFinite(+a.offsetMs) ? +a.offsetMs : 0,
          wakeMs: wakeFor(a, d)
        });
        let byDevice = refs.get(a.id);
        if (!byDevice) { byDevice = new Map(); refs.set(a.id, byDevice); }
        byDevice.set(d.serial, { a, d });
      }
    }
    const state = scheduleCoordinator.arm({
      nodeEpoch: node,
      nowEpoch: now,
      lanes,
      onFire(item) {
        const ref = refs.get(item.actionId)?.get(item.deviceId);
        if (ref) fireOne(ref.a, ref.d, item.nodeEpoch);
      }
    });
    if (state.armed && !quiet) log('⚡ 布防 ' + state.planned + ' 路发射 → 节点 ' + TC.Clock.wallClock(node) + '.' + pad3(node) + (cfg.dry ? '（演练）' : ''));
    refreshArmedBtn();
  }

  // 协调器已按「动作×设备×倒计时节点」完成判重；这里仅执行真正的脚本发射。
  // 键使用 node 而非 fireAt：fireAt 依赖设备延迟 L，扫描重测延迟也不能改变去重语义。
  function fireOne(a, d, node) {
    if (!fireController) return;
    fireController.dispatch({
      mode: 'scheduled',
      action: a,
      device: d,
      adbPath: availabilityState().path,
      dry: !!cfg.dry,
      compensate: !!cfg.comp,
      calibrated: !!cfg.cal,
      precise: !!cfg.precise,
      fireEpoch: node - wakeFor(a, d)
    });
  }

  async function testFire(a) {
    const ts = targetsOf(a);
    if (!ts.length) { log('「' + a.name + '」没有可用设备（先扫描并勾选）'); return; }
    if (!fireController) return;
    for (const d of ts) fireController.dispatch({
      mode: 'test',
      action: a,
      device: d,
      adbPath: availabilityState().path,
      dry: !!cfg.dry,
      compensate: !!cfg.comp,
      calibrated: !!cfg.cal,
      precise: false
    });
    if (cfg.dry) return;
    log('试射「' + a.name + '」→ ' + ts.length + ' 台设备');
  }

  /* ---------- 截图选点 ---------- */
  function initScreenshotController() {
    screenshotPicker = globalThis.TimeCoreDomain.createAdbScreenshotPickerView({
      handlers: {
        onSelect: (action, x, y) => screenshotController.select(action, x, y),
        onRetake: action => { void screenshotController.retake(action); },
        onClose: () => screenshotController.close()
      }
    });
    screenshotController = globalThis.TimeCoreDomain.createAdbScreenshotController({
      executor: adbExecutor,
      picker: screenshotPicker,
      targets: { resolve: action => targetsOf(action)[0] || deviceSnapshot().devices.find(x => x.state === 'device') || null },
      getAdbPath: () => availabilityState().path,
      save,
      render: renderActions,
      log,
      // 截图存档（v1.20.0）：按动作 id 落盘 userData/adb-shots/，重启后打开浮层仍能看到当时的截图
      shotStore: hasElectron ? {
        save: (name, b64) => window.electronAPI.adb('shot-save', { name, b64 }),
        load: name => window.electronAPI.adb('shot-load', { name })
      } : undefined
    });
  }
  initScreenshotController();

  function pickPoint(a, open) {
    return screenshotController.open(a, { capture: true, show: open === true });
  }

  function openPicker(a) {
    return screenshotController.open(a, { show: true });
  }

  /* ---------- 倒计时联动 ---------- */
  TC.bus.on('cd:start', i => {
    if (!hasElectron) return;
    (async () => { if (availabilityState().ok && deviceSnapshot().devices.length) await scan(true); arm(i.target); })();
  });
  function haltAll() { scheduleCoordinator.reset(); refreshArmedBtn(); }   // 停止/完成：定时器与发射记录全部作废
  TC.bus.on('cd:advance', () => { if (hasElectron) arm(TC.Countdown.info().target); });
  TC.bus.on('cd:stop', haltAll);
  TC.bus.on('cd:done', haltAll);
  TC.bus.on('cd:zero', () => {
    const state = scheduleCoordinator.state();
    if (hasElectron && state.armed && state.planned) TC.UI.toast('⚡ ADB 齐射 ' + state.planned + ' 路' + (cfg.dry ? '（演练）' : '已派出'));
  });

  /* ---------- 面板 ---------- */
  function renderStatus() {
    refreshArmedBtn();
    syncGuide();
  }

  function handleDeviceViewEvent(event) {
    const serial = event.serial;
    if (event.kind === 'rename') {
      deviceRegistry.update(serial, { name: event.name || serial });
      save(); renderChipsAll();
    } else if (event.kind === 'toggle') {
      deviceRegistry.update(serial, { on: event.on });
      save(); renderChipsAll();
    } else if (event.kind === 'calibrate') {
      void probe(serial);
    } else if (event.kind === 'reconnect') {   // 一键重连（v1.27.0）：无线走 connect 控制器，USB 走 reconnect offline
      if (serial.includes(':')) void connect(serial);
      else void adbExecutor.exec(availabilityState().path, ['reconnect', serial], { timeoutMs: 8000 }).then(r => { log('reconnect ' + serial + ' → ' + ((r.stdout || r.stderr || r.error || '').trim().slice(0, 60) || '完成')); scan(); });
    } else if (event.kind === 'tap') {
      const d = deviceRegistry.get(serial);
      if (!d) return;
      if (cfg.dry) { log('【演练】→ ' + (d.name || d.serial) + '：input tap 屏幕中心'); return; }
      if (!fireController) return;
      fireController.dispatch({
        mode: 'test',
        action: {
          type: 'tap',
          x: Math.floor((d.W || 1080) / 2),
          y: Math.floor((d.H || 2340) / 2),
          n: 1
        },
        device: d,
        adbPath: availabilityState().path,
        dry: false,
        compensate: false,
        calibrated: false,
        precise: false,
        tag: '点测'
      });
    } else if (event.kind === 'remove') {
      removeDevice(serial);
    }
  }

  // 从列表移除设备：清记录 + 清动作引用；真机重连会自动重新出现
  function removeDevice(serial) {
    deviceRegistry.remove(serial);
    actionCatalog.removeDevice(serial);
    save(); renderDevices(); renderChipsAll();
    log('已移除设备 ' + serial + '（重新连接会再次出现）');
  }

  function renderDevices() {
    deviceView.render(deviceSnapshot(), { onEvent: handleDeviceViewEvent });
    syncGuide();
  }

  function renderChipsAll() {
    actionView.refreshDevices({ actions: cfg.actions, devices: deviceSnapshot().devices });
  }

  function handleActionViewEvent(event) {
    actionController.handle(event);
  }

  function renderActions() {
    const box = $('adb-actions');
    if (!box) return;
    actionView.render({ actions: cfg.actions, devices: deviceSnapshot().devices }, { onEvent: handleActionViewEvent });
    syncGuide();
  }

  actionController = globalThis.TimeCoreDomain.createAdbActionController({
    catalog: actionCatalog,
    save,
    render: renderActions,
    onFire: action => { void testFire(action); },
    onScreenshot: action => { void pickPoint(action, true); },
    onOpenPicker: action => { void openPicker(action); }
  });

  function renderLog() {
    const box = $('adb-log');
    if (box) box.textContent = logs.join('\n') || '— 暂无记录 —';
  }

  function refreshArmedBtn() {
    const b = $('btn-adb');
    if (b) {
      b.classList.toggle('armed', lifecycleState().enabled && (scheduleCoordinator.state().armed || (availabilityState().ok && enabledActions().length > 0)));
      b.classList.toggle('off', !lifecycleState().enabled);
    }
  }

  // 总开关：停用 = 不扫描、不布防、不发射、不拉起 adb；动作配置保留
  function setEnabled(v) { return lifecycleController.setEnabled(v); }

  function renderEnabledState() {
    const cb = $('adb-enabled');
    if (cb) cb.checked = lifecycleState().enabled;
    const dr = $('adb-drawer');
    if (dr) dr.dataset.on = lifecycleState().enabled ? '1' : '0';   // 未启用时抽屉整体置灰（引导卡除外）
    refreshArmedBtn();
    syncGuide();
  }

  lifecycleController = globalThis.TimeCoreDomain.createAdbLifecycleController({
    initialEnabled: !!cfg.enabled,
    isSupported: () => hasElectron,
    setConfigEnabled: enabled => { cfg.enabled = enabled; },
    persist: save,
    halt: haltAll,
    detect,
    isAvailable: () => availabilityState().ok,
    hasDevices: () => deviceSnapshot().devices.length > 0,
    scan,
    countdown: () => {
      const info = TC.Countdown.info();
      return { armed: !!info.armed, target: info.target };
    },
    arm: target => arm(target),
    render: renderEnabledState,
    log
  });

  function resetActions() {
    if (!confirm('恢复默认示例动作？当前动作列表会被清空。')) return;
    actionCatalog.resetToSeed();
    save(); renderActions();
    log('已恢复默认示例动作');
  }

  function wire() {
    $('btn-adb').addEventListener('click', () => {
      $('drawer').classList.remove('open');
      const d = $('adb-drawer');
      const open = d.classList.toggle('open');
      if (open && !availabilityState().ok && lifecycleState().enabled && hasElectron) detect();
    });
    $('adb-close').addEventListener('click', () => $('adb-drawer').classList.remove('open'));
    $('adb-enabled').addEventListener('change', e => setEnabled(e.target.checked));
    $('adb-download').addEventListener('click', downloadAdb);
    $('adb-detect').addEventListener('click', () => detect($('adb-path').value.trim()));
    $('adb-scan').addEventListener('click', () => availabilityState().ok ? scan() : detect());
    $('adb-connect-btn').addEventListener('click', () => {
      const ip = $('adb-connect').value.trim();
      if (ip) availabilityState().ok ? connect(ip) : log('先检测 adb');
    });
    $('adb-add').addEventListener('click', () => {
      actionCatalog.add($('adb-add-type').value || 'tap');
      save(); renderActions();
    });
    $('adb-reset').addEventListener('click', resetActions);
    $('adb-lead').value = cfg.leadMs;
    $('adb-lead').addEventListener('input', e => { cfg.leadMs = +e.target.value || 0; save(); });
    $('adb-cal').checked = cfg.cal;
    $('adb-cal').addEventListener('change', e => { cfg.cal = e.target.checked; save(); });
    $('adb-precise').checked = cfg.precise;
    $('adb-precise').addEventListener('change', e => { cfg.precise = e.target.checked; save(); });
    $('adb-comp').checked = cfg.comp;
    $('adb-comp').addEventListener('change', e => { cfg.comp = e.target.checked; save(); log('间隔补偿 ' + (cfg.comp ? '开启（间隔≈实际点击间隔）' : '关闭（间隔=纯 sleep 时长）')); });
    $('adb-dry').checked = cfg.dry;
    $('adb-dry').addEventListener('change', e => { cfg.dry = e.target.checked; save(); log('演练模式 ' + (cfg.dry ? '开启（只记日志不执行）' : '关闭')); });
    $('adb-path').value = cfg.path || '';
    renderEnabledState();
    renderStatus(); renderDevices(); renderActions(); renderLog(); refreshArmedBtn();
    if (hasElectron) {
      if (lifecycleState().enabled) detect();
      // 设备自动刷新：启用且抽屉打开或已布防时每 5 秒静默扫描
      setInterval(() => { if (lifecycleState().enabled && ($('adb-drawer').classList.contains('open') || scheduleCoordinator.state().armed)) scan(true); }, 5000);
    }
  }

  TC.bus.on('boot', () => {
    if (!cfg.seeded) {
      actionCatalog.seed();
      cfg.seeded = true;
      save();
    }
    wire();
  });

  /* ---------- 调试接口 ---------- */
  TC.ADB = {
    debug() {
      const state = scheduleCoordinator.state();
      const snapshot = deviceSnapshot();
      const availability = availabilityState();
      return { adbOk: availability.ok, adbPath: availability.path, adbVer: availability.version, adbAncient: availability.ancient, enabled: lifecycleState().enabled, armed: state.armed, plannedN: state.planned, spawnedN: state.spawned, pending: state.pending, cfg, devices: snapshot.devices, logs: logs.slice(0, 12) };
    },
    // 测试钩子：注入模拟在线设备（配合演练模式做确定性回归；test 标记使其免疫扫描清理，永不参与真实发射）
    _dev(serial, TI) {
      const d = { serial, name: '模拟机', state: 'device', model: 'TEST', L: 100, W: 1080, H: 2340, TI: TI != null ? TI : 0, on: true, probedAt: TC.time.epoch(), test: true };
      deviceRegistry.upsert(d);
      syncCfgDevices();
      renderDevices();
      return d;
    },
    // 调试/测试：直接查看某设备将生成的脚本
    genScript(a, serial) {
      return genScript(a, deviceRegistry.get(serial) || { serial: serial || '?', W: 1080, H: 2340 });
    },
    detect, scan, testFire, arm, pickPoint, openPicker, setEnabled, removeDevice,
    dry(v) { cfg.dry = !!v; save(); }
  };
})();
