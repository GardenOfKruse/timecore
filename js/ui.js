/* UI：面板绑定、反馈渲染、快捷键、设置持久化、Electron 粘合 */
(function () {
  const ZONES = ['local', 'UTC', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Seoul',
    'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
    'Australia/Sydney', 'Pacific/Auckland'];

  const el = {};
  let windowController = null;
  let toastTimer = 0, vignetteTimer = 0;

  // 闲置自流动（v1.16.0）：600s 无输入 → body.idle 界面退场；布防等触发期间不生效，任意输入即恢复。
  // 状态机在 IIFE 顶层（TC.UI.forceIdle/idleState 出口与 bindControls 的监听注册共用）。
  const IDLE_MS = 600000;
  let idleTimer = 0;
  let idleOn = false;
  function setIdle(on) {
    if (on === idleOn) return;
    if (on) {
      const cd = TC.Countdown.info();
      if (cd.armed && !cd.fired) return;   // 正在等触发不算闲置
    }
    idleOn = on;
    document.body.classList.toggle('idle', on);
  }
  function pokeIdle() {
    setIdle(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setIdle(true), IDLE_MS);
  }
  const firedStats = TimeCoreDomain.createFiredStats();   // 每日到点统计（v1.14.0）
  let firedSaveTimer = 0;
  try { firedStats.load(JSON.parse(localStorage.getItem('tc.cdstats.v1') || 'null')); } catch (_) {}
  function renderFiredStats() {
    const box = document.getElementById('cd-stats');
    if (!box) return;
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const sum = firedStats.summary(key);
    box.textContent = '今日到点 ' + (sum.today ? sum.today.count : 0) + ' · 累计 ' + sum.total;
    const keys = Object.keys(sum.days).sort().slice(-7);
    box.title = '每日到点统计（本地保存 30 天）\n近 7 日：' + keys.map(k => k.slice(5) + ' ' + sum.days[k].count + ' 次').join('，');
  }

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms || 2400);
  }

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  // 简易 semver 比较：>0 表示 a 更新
  function cmpVer(a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < 3; i++) {
      const d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0);
      if (d) return d;
    }
    return 0;
  }

  /* ---------- 渲染函数（主循环/事件调用） ---------- */
  function renderSync() {
    const s = TC.time.status, off = TC.time.offset;
    el.badge.dataset.s = s;
    let txt = '本地时钟';
    if (s === 'synced') txt = '已校时 ' + (off >= 0 ? '+' : '') + off + 'ms';
    else if (s === 'syncing') txt = '校时中…';
    else if (s === 'failed') txt = '校时失败 · 本地';
    else if (s === 'stale') txt = '偏移保持 ' + (off >= 0 ? '+' : '') + off + 'ms';
    else if (s === 'local' && TC.time.noSync) txt = '本地时钟（未联网校时）';
    el.badge.querySelector('b').textContent = txt;
    const lt = document.getElementById('lt-sync');
    if (lt) lt.dataset.s = s === 'synced' ? 'ok' : s === 'syncing' ? 'busy' : 'warn';
  }

  function fmtTargetMs(t) {
    return TC.pad(Math.floor(((t % 1000) + 1000) % 1000), 3);
  }

  function fmtPeriod(ms) {
    if (ms % 3600000 === 0) return (ms / 3600000) + '时';
    if (ms % 60000 === 0) return (ms / 60000) + '分';
    return (ms / 1000) + '秒';
  }

  function fmtTrigger(target) {
    return '触发 ' + TC.Clock.wallClock(target) + '.' + fmtTargetMs(target);
  }

  function renderCd(info) {
    el.remaining.textContent = info.fired ? '00:00.000' : TC.Countdown.fmtRemaining(info.remainingMs);
    el.phase.textContent = info.phaseLabel;
    el.phase.className = 'chip ph-' + info.phase;

    if (info.fired && info.hasNext) {
      // 驻留期（armed 仍为 true，必须先判 fired）：大数字停在 00:00，小字预告下一轮从哪一刻开始
      const nextNode = info.target + (info.durMs || info.periodMs || 0);
      el.target.textContent = '下一轮 ' + fmtPeriod(info.durMs || info.periodMs) + ' · ' + fmtTrigger(nextNode) + ' 开始';
    } else if (info.armed) {
      let line = fmtTrigger(info.target);
      if (info.mode === 'cycles') line += ' · 第 ' + info.cycleIndex + '/' + (info.infinite ? '∞' : info.cycles) + ' 轮';
      if (info.aligned) line += ' · 每' + fmtPeriod(info.periodMs);
      el.target.textContent = line;
    } else {
      el.target.textContent = '触发 —';
    }
  }

  function showJudge(rec) {
    el.judge.className = 't-' + rec.label;
    el.judge.querySelector('.label').textContent = rec.label;
    el.judge.querySelector('.dev').textContent =
      (rec.dev > 0 ? '晚 ' : rec.dev < 0 ? '早 ' : '') + Math.abs(rec.dev) + 'ms';
    void el.judge.offsetWidth;              // 重触发动画
    el.judge.classList.add('show');

    el.combo.hidden = false;
    el.comboNum.textContent = rec.combo;
    el.comboNum.className = rec.combo >= 10 ? 'rage' : rec.combo >= 5 ? 'hot' : '';
    el.comboAcc.textContent = '准确率 ' + Math.round(rec.acc * 100) + '%';
    el.comboMax.textContent = '最高 ' + rec.maxCombo;

    if (rec.label === 'MISS') {
      el.vignette.classList.add('miss');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => el.vignette.classList.remove('miss'), 280);
    }
  }

  function showZero(d) {
    el.zeroSub.textContent = d.hasNext ? '第 ' + (d.cycleIndex + 1) + ' 个节点充能中…' : '全部节点完成';
    el.zero.hidden = false;
    void el.zero.offsetWidth;
    el.zero.classList.add('show');
    setTimeout(() => { el.zero.classList.remove('show'); el.zero.hidden = true; }, 2300);
    el.flash.classList.add('on');
    setTimeout(() => el.flash.classList.remove('on'), 90);
  }

  /* ---------- 绑定 ---------- */
  function bindControls() {
    // 时区
    for (const z of ZONES) {
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z === 'local' ? '本地时区' : z;
      el.tz.appendChild(o);
    }
    el.tz.value = TC.Clock.tz;
    el.tz.addEventListener('change', () => { TC.Clock.setTz(el.tz.value); toast('时区 → ' + (el.tz.value === 'local' ? '本地' : el.tz.value)); });

    // 快捷倒计时：对齐到整节点（10s → 每个整10秒；5m → 每个整5分时刻）
    document.querySelectorAll('.chip-btn').forEach(b => {
      b.addEventListener('click', () => {
        const periodMs = parseInt(b.dataset.sec, 10) * 1000;
        const inf = el.inf.checked, cyc = parseInt(el.cycles.value, 10) || 1;
        TC.Countdown.startAligned(periodMs, cyc, inf);
        b.blur();
      });
    });

    // 自定义开始：分/秒作为对齐周期
    el.start.addEventListener('click', () => {
      const min = parseInt(el.min.value, 10) || 0, sec = parseInt(el.sec.value, 10) || 0;
      const periodMs = (min * 60 + sec) * 1000;
      if (periodMs < 1000) { toast('周期至少 1 秒'); return; }
      const inf = el.inf.checked, cyc = parseInt(el.cycles.value, 10) || 1;
      TC.Countdown.startAligned(periodMs, cyc, inf);
      el.start.blur();
    });
    el.stop.addEventListener('click', () => { TC.Countdown.stop(); toast('已停止'); el.stop.blur(); });

    // 定时：今天的下一个该时刻（已过则明天）；快捷「下一个整点」
    el.absGo.addEventListener('click', () => {
      const v = el.abs.value;
      if (!v) { toast('请先选择时刻'); return; }
      const p = v.split(':').map(x => parseInt(x, 10) || 0);
      const t = new Date();
      t.setHours(p[0], p[1] || 0, p[2] || 0, 0);
      if (t.getTime() <= TC.time.epoch()) t.setDate(t.getDate() + 1);
      TC.Countdown.startSingle(t.getTime());
      el.absGo.blur();
    });
    el.absHour.addEventListener('click', () => {
      const t = new Date(TC.time.epoch() + 60000);
      t.setMinutes(0, 0, 0);
      t.setHours(t.getHours() + 1);
      TC.Countdown.startSingle(t.getTime());
      el.absHour.blur();
    });

    // 倒计时面板输入持久化（重启后保留上次设置）
    let cdPrefs = {};
    try { cdPrefs = JSON.parse(localStorage.getItem('tc.cd') || '{}'); } catch (_) {}
    if (cdPrefs.min != null) el.min.value = cdPrefs.min;
    if (cdPrefs.sec != null) el.sec.value = cdPrefs.sec;
    if (cdPrefs.cycles != null) el.cycles.value = cdPrefs.cycles;
    if (cdPrefs.inf != null) el.inf.checked = cdPrefs.inf;
    const saveCd = () => localStorage.setItem('tc.cd', JSON.stringify({ min: el.min.value, sec: el.sec.value, cycles: el.cycles.value, inf: el.inf.checked }));
    el.min.addEventListener('input', saveCd);
    el.sec.addEventListener('input', saveCd);
    el.cycles.addEventListener('input', saveCd);
    el.inf.addEventListener('change', saveCd);

    // 顶栏按钮
    el.mute.addEventListener('click', () => { TC.Audio.unlock(); TC.Audio.setMute(!TC.Audio.muted); el.mute.classList.toggle('active', TC.Audio.muted); el.mute.blur(); });
    el.freerun.addEventListener('click', () => { TC.Audio.unlock(); TC.Beats.toggleFreerun(); el.freerun.blur(); });
    el.compact.addEventListener('click', () => { toggleCompact(); el.compact.blur(); });
    el.fullscreen.addEventListener('click', () => { toggleFullscreen(); el.fullscreen.blur(); });
    el.settings.addEventListener('click', () => { el.drawer.classList.toggle('open'); el.settings.blur(); });

    // 设置抽屉
    el.hue.value = TC.Scene.hue;
    el.hue.addEventListener('input', () => TC.Scene.setHue(parseInt(el.hue.value, 10)));
    el.vol.value = Math.round(TC.Audio.volume * 100);
    el.vol.addEventListener('input', () => TC.Audio.setVolume(parseInt(el.vol.value, 10) / 100));
    el.tick.value = TC.Audio.tickOn ? '1' : '0';
    el.tick.addEventListener('change', () => TC.Audio.setTick(el.tick.value === '1'));
    const pkSel = document.getElementById('set-pack');
    if (pkSel) {
      pkSel.value = TC.Audio.packKey;
      pkSel.addEventListener('change', () => { TC.Audio.setPack(pkSel.value); toast('音效主题：' + TC.Audio.debugSoundPack().label); });
    }
    el.softlead.value = TC.Audio.softLead;
    el.softlead.addEventListener('input', () => TC.Audio.setSoftLead(el.softlead.value));
    const mf = document.getElementById('set-metrofull');
    if (mf) {
      mf.checked = TC.Audio.info().metroFull;
      mf.addEventListener('change', () => {
        localStorage.setItem('tc.metrofull', mf.checked ? '1' : '0');
        toast(mf.checked ? '倒计时全程节拍：开（节拍器开启时每秒提示）' : '倒计时全程节拍：关（仅最后阶段提示）');
      });
    }
    el.zero.value = String(TC.fx.zero);
    el.zero.addEventListener('change', () => { TC.fx.zero = parseInt(el.zero.value, 10) || 0; localStorage.setItem('tc.zerofx', String(TC.fx.zero)); });
    ['beat', 'cue', 'hit'].forEach(cat => {
      const input = el['g' + cat[0].toUpperCase() + cat.slice(1)];
      if (!input) return;
      input.value = Math.round(TC.Audio.track(cat) * 100);
      input.addEventListener('input', () => TC.Audio.setTrack(cat, parseInt(input.value, 10) / 100));
    });
    TC.bus.on('phase', ph => { document.body.dataset.phase = ph; });
    el.resync.addEventListener('click', () => { toast('重新校时…'); TC.time.sync(); });
    el.simfail.addEventListener('click', () => { TC.time.simulateFail(); toast('已模拟失联 · 平滑回退本地时间'); });
    el.xparent.checked = document.body.classList.contains('xparent');
    el.xparent.addEventListener('change', () => {
      document.body.classList.toggle('xparent', el.xparent.checked);
      localStorage.setItem('tc.xparent', el.xparent.checked ? '1' : '0');
      if (window.electronAPI) toast('透明背景已' + (el.xparent.checked ? '开启' : '关闭'));
      else toast('透明背景在桌面端窗口生效');
    });

    // Electron：窗口控制统一在标题栏（置顶/最小化/全屏/关闭）
    if (window.electronAPI) {
      windowController = TimeCoreDomain.createWindowController(window.electronAPI);
      document.body.classList.add('electron');
      el.opacityInput.hidden = false;
      const savedOp = Math.min(100, Math.max(30, parseInt(localStorage.getItem('tc.opacity'), 10) || 100));
      el.opacityInput.value = savedOp;
      if (savedOp < 100) windowController.setOpacity(savedOp / 100);
      el.opacityInput.addEventListener('input', () => {
        const v = parseInt(el.opacityInput.value, 10);
        windowController.setOpacity(v / 100);
        localStorage.setItem('tc.opacity', String(v));
      });
      TC.$('tb-min').addEventListener('click', () => windowController.minimize());
      TC.$('tb-fs').addEventListener('click', () => windowController.toggleFullscreen());
      TC.$('tb-overlay').addEventListener('click', toggleClockMode);
      // 钟面形态：双击面板任意处退出 + 手动拖窗（无 app-region，真实鼠标事件全可用）+ 首次提示
      const cpanel = document.querySelector('.clock-panel');
      let dragMoved = false, dragActive = false, leftButtonDown = false, dsx = 0, dsy = 0;
      let cancelDrag = null;
      // 左键状态是缩放的硬闸门：失焦/指针捕获丢失时 dragActive 可能先被清掉，
      // 但物理按键仍未释放。主进程也收一份状态，避免 IPC 到达时只剩“滚轮”信息。
      const setLeftButton = held => {
        if (leftButtonDown === held) return;
        leftButtonDown = held;
        windowController.setLeftButton(held);
      };
      window.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        setLeftButton(true);
      }, true);
      window.addEventListener('mouseup', e => {
        if (e.button !== 0 || e.isTrusted === false) return;
        setLeftButton(false);
      }, true);
      // PointerEvent 是 Electron/Chromium 的另一条真实释放路径；pointercancel 不解锁，
      // 因为它可能只是失焦/捕获转移，左键物理状态仍未知。不能用 mousemove.buttons=0 推断释放，
      // 长按失焦时该字段可能先变成 0，正是此前“长按后滚轮放大”的根因。
      window.addEventListener('pointerup', e => {
        if (e.button !== 0 || e.isTrusted === false) return;
        setLeftButton(false);
      }, true);
      cpanel.addEventListener('mousedown', e => {
        if (e.button !== 0 || !document.body.classList.contains('clockmode')) return;
        if (e.target.closest('button, select, input')) return;   // 控件不触发拖动
        dsx = e.clientX; dsy = e.clientY; dragMoved = false;
        dragActive = true;
        windowController.beginMove();
        const mv = ev => { if (Math.hypot(ev.clientX - dsx, ev.clientY - dsy) > 4) dragMoved = true; };
        const up = () => {
          dragActive = false;
          windowController.endMove();
          window.removeEventListener('mouseup', up);
          window.removeEventListener('mousemove', mv);
          if (cancelDrag === up) cancelDrag = null;
        };
        cancelDrag = up;
        window.addEventListener('mousemove', mv);
        window.addEventListener('mouseup', up);
      });
      cpanel.addEventListener('dblclick', () => {
        if (document.body.classList.contains('clockmode') && !dragMoved) toggleClockMode();
      });
      cpanel.addEventListener('wheel', e => {
        if (!document.body.classList.contains('clockmode') || !windowController) return;
        e.preventDefault();
        const buttons = Number(e.buttons) || 0;
        // dragActive 是拖窗态，leftButtonDown/buttons 是物理按键态；三者任一成立都不缩放。
        if (dragActive || leftButtonDown || (buttons & 1)) return;
        windowController.zoom(e.deltaY, buttons);
      }, { passive: false });
      window.addEventListener('blur', () => {
        // 停止移动定时器，但不要把左键当成已释放；后续 wheel 仍必须被拦截。
        if (cancelDrag) cancelDrag();
        else dragActive = false;
      });
      let hintShown = false;
      const faceHint = document.getElementById('face-hint');
      TC.bus.on('clockmode', on => {
        if (on && faceHint && !hintShown && localStorage.getItem('tc.hint.clock') !== '1') {
          hintShown = true;
          faceHint.classList.add('show');
          setTimeout(() => { faceHint.classList.remove('show'); localStorage.setItem('tc.hint.clock', '1'); }, 3500);
        }
      });
      // 形态状态同步：主进程推送即时翻转（右键菜单进/出不迟到）+ 800ms 轮询兜底
      const applyWinState = st => {
        const was = document.body.classList.contains('clockmode');
        const isClock = !!st.clock;
        document.body.classList.toggle('clockmode', isClock);
        if (was !== isClock) TC.bus.emit('clockmode', isClock);   // 进入/退出都通知钟面动效收尾
        syncFullscreenBtn(st.fs);
        TC.$('tb-top').classList.toggle('active', !!st.top);
        if (st.ver !== null) {
          const v = st.ver ? 'v' + st.ver : '';
          el.tbVer.textContent = v;
          el.aboutVer.textContent = v;
          el.drawerVer.textContent = v;
        }
      };
      windowController.subscribe(applyWinState);
      windowController.connect(800);
      TC.$('tb-close').addEventListener('click', () => windowController.close());
      TC.$('tb-top').addEventListener('click', () => {
        windowController.toggleTop();
        void windowController.refresh();
      });

      // 关于浮层：点标题栏 TIMECORE 展开；点击外部 / Esc 收起
      TC.$('tb-title').addEventListener('click', () => { el.aboutPop.hidden = !el.aboutPop.hidden; });
      document.addEventListener('pointerdown', e => {
        if (!el.aboutPop.hidden && !el.aboutPop.contains(e.target) && !TC.$('tb-title').contains(e.target)) el.aboutPop.hidden = true;
      });
      el.aboutGh.addEventListener('click', () => windowController.open('https://github.com/GardenOfKruse/timecore/releases'));
      el.aboutCheck.addEventListener('click', async function () {
        this.disabled = true;
        const old = this.textContent;
        this.textContent = '检查中…';
        try {
          const r = await fetch('https://api.github.com/repos/GardenOfKruse/timecore/releases/latest', { headers: { 'Accept': 'application/vnd.github+json' } });
          const j = await r.json();
          const latest = String(j.tag_name || '').replace(/^v/, '');
          const cur = String(el.aboutVer.textContent || '').replace(/^v/, '');
          if (latest && cmpVer(latest, cur) > 0) {
            toast('⬆ 发现新版本 v' + latest + ' —— 正在打开 Releases 页面');
            windowController.open(j.html_url);
          } else if (latest) {
            toast('✓ 已是最新版本 v' + cur);
          } else {
            toast('检查更新失败：未获取到版本信息');
          }
        } catch (_) {
          toast('检查更新失败：网络不可达');
        }
        this.disabled = false;
        this.textContent = old;
      });
    } else {
      el.drawerVer.textContent = 'web';
    }

    // 击拍输入：空格 / 画布左键
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat && !isTyping(e.target)) {
        e.preventDefault();
        TC.Audio.unlock();
        TC.Beats.hit(TC.time.epoch());
      } else if (e.code === 'KeyB' && !e.repeat && !isTyping(e.target)) {
        const on = TC.Beats.toggleFreerun();
        toast(on ? '自由节拍器开启 · 跟随整秒击拍' : '自由节拍器关闭');
      } else if (e.code === 'KeyF' && !e.repeat && !isTyping(e.target)) toggleFullscreen();
      else if (e.code === 'KeyC' && !e.repeat && !isTyping(e.target)) toggleCompact();
      else if (e.code === 'KeyM' && !e.repeat && !isTyping(e.target)) { TC.Audio.setMute(!TC.Audio.muted); el.mute.classList.toggle('active', TC.Audio.muted); }
      else if (e.ctrlKey && !e.repeat && /^Digit[1-3]$/.test(e.code) && windowController) {
        e.preventDefault();
        if (e.code === 'Digit1') { toggleClockMode(); return; }
        windowController.setSize(e.code === 'Digit2' ? 'small' : 'standard');
      } else if (e.code === 'Escape') {
        if (fsNow && windowController) { toggleFullscreen(); return; }   // 全屏时 Esc 先退全屏
        if (document.body.classList.contains('clockmode')) { toggleClockMode(); return; }   // 仅时间形态时 Esc 退出
        el.drawer.classList.remove('open');
        if (el.aboutPop) el.aboutPop.hidden = true;
      }
    });
    window.addEventListener('pointerdown', e => {
      if (e.target && e.target.id === 'scene') {
        TC.Audio.unlock();
      }
    });
    window.addEventListener('tc:scene-click', () => TC.Beats.hit(TC.time.epoch()));
    // 浏览器模式：HTML 全屏状态变化时同步按钮高亮
    document.addEventListener('fullscreenchange', () => syncFullscreenBtn(!!document.fullscreenElement));

    // 事件 → UI
    TC.bus.on('beat:judge', showJudge);
    TC.bus.on('beat:none', () => toast('无活动节拍 · 开启倒计时或按 B 启动节拍器'));
    TC.bus.on('cd:zero', showZero);
    TC.bus.on('cd:zero', () => {
      // 每日到点统计（v1.14.0）：计数 + 防抖持久化 + 抽屉行刷新；累计每满 100 补一颗流星
      const key = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
      const r = firedStats.record(key);
      clearTimeout(firedSaveTimer);
      firedSaveTimer = setTimeout(() => { try { localStorage.setItem('tc.cdstats.v1', firedStats.serialize()); } catch (_) {} }, 800);
      renderFiredStats();
      if (r.milestone) TC.Scene.meteor();
    });
    TC.bus.on('cd:advance', d => toast('第 ' + d.cycleIndex + ' 轮 · ' + fmtTrigger(TC.Countdown.info().target)));
    TC.bus.on('cd:done', () => toast('全部周期完成 ✓'));
    TC.bus.on('cd:start', i => toast(fmtTrigger(i.target) + (i.aligned ? '（每' + fmtPeriod(i.periodMs) + '）' : '')));
    TC.bus.on('freerun', on => el.freerun.classList.toggle('active', on));
    TC.bus.on('mute', m => el.mute.classList.toggle('active', m));
    TC.bus.on('sync', renderSync);
    // 闲置自流动：输入监听在顶层状态机上注册（见文件头部 idleState 块）
    ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(ev => window.addEventListener(ev, pokeIdle, { passive: true }));
    pokeIdle();
    setInterval(() => { if (idleOn) { const cd = TC.Countdown.info(); if (cd.armed && !cd.fired) setIdle(false); } }, 2000);
    TC.bus.on('tz', () => { el.tz.value = TC.Clock.tz; });

    // 倒计时状态事件 → 开始/停止按钮
    TC.bus.on('cd:start', syncRunState);
    TC.bus.on('cd:stop', syncRunState);
    TC.bus.on('cd:done', syncRunState);
    syncRunState();

    // 标题栏状态灯：校时由 renderSync 驱动；ADB 由 adb 模块外发；音频轮询 AudioContext 状态
    const setLight = (id, s) => { const n = document.getElementById(id); if (n) n.dataset.s = s; };
    TC.bus.on('adb:state', st => setLight('lt-adb', !st.enabled ? 'off' : st.ready ? 'ok' : st.ok ? 'busy' : 'warn'));
    setInterval(() => {
      const i = TC.Audio.info();
      setLight('lt-aud', i.muted ? 'warn' : i.state === 'running' ? 'ok' : 'busy');
    }, 1500);
  }

  /* 尺寸形态：正常 ⇄ 小窗（C 键循环，Ctrl+2/3 直达）；仅时间走 Ctrl+1；全屏 F。
   * 浏览器模式退化为 CSS 密度开关 */
  const SIZE_ORDER = ['standard', 'small'];
  function currentSize() {
    return innerWidth < 640 ? 'small' : 'standard';
  }
  function toggleCompact() {
    if (windowController) {
      windowController.setSize(SIZE_ORDER[(SIZE_ORDER.indexOf(currentSize()) + 1) % SIZE_ORDER.length]);
      return;
    }
    const on = !document.body.classList.contains('compact');
    document.body.classList.toggle('compact', on);
    localStorage.setItem('tc.compact', on ? '1' : '0');
    el.compact.classList.toggle('active', on);
  }

  // 密度随实际宽度自适应：手动拖拽边缘也会自动切换布局档位
  let densTimer = 0;
  function applyDensity() {
    const w = innerWidth;
    document.body.classList.toggle('mini', w < 450);
    document.body.classList.toggle('compact', w < 780);
    el.compact.classList.toggle('active', w < 780);
  }
  window.addEventListener('resize', () => { clearTimeout(densTimer); densTimer = setTimeout(applyDensity, 120); });

  /* 仅时间形态：同一窗口的钟面形态（Ctrl+1 / 标题栏 ◉ / 双击时间区 退出） */
  function toggleClockMode() {
    const on = !document.body.classList.contains('clockmode');
    document.body.classList.toggle('clockmode', on);
    if (windowController) windowController.setSize('clock');
    TC.bus.emit('clockmode', on);
    toast(on ? '仅时间形态：双击退出 · 右键菜单 · 滚轮缩放' : '已退出仅时间形态');
  }

  // 倒计时运行态 → 开始/停止按钮状态化：开始是动作按钮，运行中显示「重新布防」，空闲时停止禁用
  function syncRunState() {
    const armed = TC.Countdown.info().armed;
    el.start.textContent = armed ? '重新布防' : '开始';
    el.start.title = armed ? '运行中：按当前参数重新对齐布防' : '按分/秒周期对齐布防';
    el.start.classList.toggle('running', armed);
    el.stop.disabled = !armed;
  }

  // 首次启动欢迎卡：开启节拍器按钮同时完成音频解锁手势（AudioContext 需用户手势才允许出声）
  function showWelcome() {
    const w = document.getElementById('welcome');
    if (!w) return;
    w.hidden = false;
    const finish = withBeat => {
      w.hidden = true;
      localStorage.setItem('tc.welcomed', '1');
      if (withBeat) { TC.Audio.unlock(); TC.Beats.toggleFreerun(true); }
      else localStorage.setItem('tc.freerun', '0');   // 静默进入：之后开机也不自启节拍器
    };
    document.getElementById('wl-beat').addEventListener('click', () => finish(true));
    document.getElementById('wl-skip').addEventListener('click', () => finish(false));
    document.getElementById('wl-adb').addEventListener('click', () => {
      finish(false);
      document.getElementById('drawer').classList.remove('open');
      document.getElementById('adb-drawer').classList.add('open');
      toast('打开「启用 ADB 齐射」开关，按引导完成配置');
    });
  }

  let fsNow = false;   // 显式同步的全屏状态（Electron 下由主进程回传）

  function toggleFullscreen() {
    if (windowController) {
      // 桌面端走原生 setFullScreen（HTML5 Fullscreen 在无边框透明窗口上进出不可靠）
      windowController.toggleFullscreen();
      void windowController.refresh();
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function syncFullscreenBtn(fs) {
    fsNow = !!fs;
    el.fullscreen.classList.toggle('active', fsNow);
  }

  TC.UI = {
    init() {
      const ids = {
        clockHms: 'clock-hms', clockMs: 'clock-ms', clockDate: 'clock-date', tz: 'tz-select', badge: 'sync-badge',
        phase: 'cd-phase', cycle: 'cd-cycle', remaining: 'cd-remaining', target: 'cd-target',
        min: 'cd-min', sec: 'cd-sec', cycles: 'cd-cycles', inf: 'cd-inf', start: 'cd-start', stop: 'cd-stop',
        abs: 'cd-abs-time', absGo: 'cd-abs-go', absHour: 'cd-abs-hour', judge: 'judge-pop', combo: 'combo', comboNum: 'combo-num',
        comboAcc: 'combo-acc', comboMax: 'combo-max', zero: 'zero-msg', zeroSub: 'zero-sub',
        drawer: 'drawer', hue: 'set-hue', vol: 'set-vol', tick: 'set-tick', softlead: 'set-softlead',
        resync: 'btn-resync', simfail: 'btn-simfail', opacityInput: 'set-opacity', xparent: 'set-xparent',
        toast: 'toast', flash: 'flash', mute: 'btn-mute', freerun: 'btn-freerun', compact: 'btn-compact',
        fullscreen: 'btn-fullscreen', settings: 'btn-settings',
        tbVer: 'tb-ver', aboutVer: 'about-ver', drawerVer: 'drawer-ver',
        aboutPop: 'about-pop', aboutCheck: 'about-check', aboutGh: 'about-gh'
      };
      for (const key of Object.keys(ids)) el[key] = TC.$(ids[key]);
      el.vignette = document.getElementById('vignette');
      bindControls();

      if (window.electronAPI) applyDensity();   // 桌面端密度随窗口宽度自动适配（含记忆/预设尺寸）
      else if (localStorage.getItem('tc.compact') === '1') {
        document.body.classList.add('compact');
        el.compact.classList.add('active');
      }
      if (TC.fresh) showWelcome();
      if (localStorage.getItem('tc.xparent') === '1') {
        document.body.classList.add('xparent');
        el.xparent.checked = true;
      }
      el.mute.classList.toggle('active', TC.Audio.muted);
      renderSync();
      TC.bus.emit('boot');
    },
    renderCd, renderSync, toast,
    // 闲置自流动（v1.16.0）测试钩子：强制翻转 + 状态探针（真实 600s 边界等不起）
    forceIdle(on) { if (on) { clearTimeout(idleTimer); setIdle(true); } else pokeIdle(); },
    idleState() { return idleOn; }
  };
})();
