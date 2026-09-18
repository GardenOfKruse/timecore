/* 时钟：Intl 时区渲染，毫秒 3 位；每帧更新 */
(function () {
  let tzKey = localStorage.getItem('tc.tz') || 'local';
  const cache = new Map();
  const WD = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' };

  function fmt(key, opts) {
    const id = key + '|' + JSON.stringify(opts);
    if (!cache.has(id)) {
      cache.set(id, new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: key === 'local' ? undefined : key, hour12: false }, opts)));
    }
    return cache.get(id);
  }

  function partsOf(key, e, opts) {
    const p = {};
    for (const it of fmt(key, opts).formatToParts(e)) p[it.type] = it.value;
    if (p.hour === '24') p.hour = '00';   // en-GB 午夜怪癖
    return p;
  }

  const motion = {
    phase: 'IDLE', reduced: false, supported: false, media: null, animations: []
  };

  TC.Clock = {
    get tz() { return tzKey; },

    setTz(k) {
      try { new Intl.DateTimeFormat('en', { timeZone: k === 'local' ? undefined : k }); }
      catch (_) { k = 'local'; }
      tzKey = k;
      localStorage.setItem('tc.tz', k);
      last.h = last.m = last.s = '';   // 强制重绘
      TC.bus.emit('tz', k);
    },

    // 任意时区的 HH:MM:SS（倒计时目标时刻显示用）
    wallClock(e, key) {
      const p = partsOf(key || tzKey, e, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return p.hour + ':' + p.minute + ':' + p.second;
    },

    // 主循环每帧调用
    render(e) {
      const p = partsOf(tzKey, e, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
      // 时/分/秒独立 span：只有变化的数字对重绘并做 tick 微动画（毫秒不受影响）
      const cur = { h: p.hour, m: p.minute, s: p.second };
      for (const k of ['h', 'm', 's']) {
        if (cur[k] === last[k]) continue;
        last[k] = cur[k];
        const n = el.pairs[k];
        n.textContent = cur[k];
        n.classList.remove('tick');
        void n.offsetWidth;   // 重启动画
        n.classList.add('tick');
      }
      el.ms.textContent = '.' + TC.pad(Math.floor(((e % 1000) + 1000) % 1000), 3);
      // 秒环：彗尾沿钟面边框每秒绕一周（毫秒驱动）
      if (el.ring) el.ring.style.strokeDashoffset = String(1000 - (((e % 1000) + 1000) % 1000));
      const dayKey = p.year + p.month + p.day;
      if (dayKey !== last.day) {
        last.day = dayKey;
        el.date.textContent = p.year + '-' + p.month + '-' + p.day + ' ' + (WD[p.weekday] || p.weekday);
      }
    },

    // cycle31/诊断用：确认钟面动效确实由 WAAPI 驱动，而不是只存在 CSS 文本。
    debugMotion() {
      const active = motion.animations.filter(a => {
        try { return a && a.playState !== 'idle'; } catch (_) { return !!a; }
      }).length;
      return {
        phase: motion.phase,
        reduced: motion.reduced,
        supported: motion.supported,
        animations: active,
        breathOpacity: el.breath ? getComputedStyle(el.breath).opacity : null,
        hmsTransform: el.hms ? getComputedStyle(el.hms).transform : null
      };
    }
  };

  const el = { pairs: {} };
  const last = { h: '', m: '', s: '', day: '' };

  const MOTION_PROFILE = {
    // 一轻一重，中间留白；阶段只改变节奏和幅度，不叠加新的视觉对象。
    NORMAL: { duration: 2600, peak: 0.42, second: 0.25, scale: 1.004, dip: 0.988 },
    WARMUP: { duration: 1800, peak: 0.52, second: 0.31, scale: 1.005, dip: 0.984 },
    SURGE:  { duration: 1100, peak: 0.64, second: 0.39, scale: 1.006, dip: 0.980 },
    PULSE:  { duration:  620, peak: 0.76, second: 0.48, scale: 1.007, dip: 0.974 }
  };

  function cancelMotion() {
    for (const a of motion.animations) {
      try { a.cancel(); } catch (_) { /* 动效已被浏览器回收 */ }
    }
    motion.animations = [];
    if (el.breath) el.breath.style.opacity = '0';
    if (el.hms) {
      el.hms.style.transform = '';
      el.hms.style.opacity = '';
    }
  }

  function applyMotionPhase(phase) {
    const ph = phase || 'IDLE';
    motion.phase = ph;
    motion.reduced = !!(motion.media && motion.media.matches);
    cancelMotion();
    // 动效严格限定在小时间窗口；正常窗口只保留阶段类供其他 UI 使用。
    if (!document.body.classList.contains('clockmode') || !el.breath || !el.hms || ph === 'IDLE') return;

    const canAnimate = typeof el.breath.animate === 'function' && typeof el.hms.animate === 'function';
    motion.supported = canAnimate;
    if (motion.reduced || !canAnimate) {
      el.breath.style.opacity = ph === 'ZERO' ? '0.58' : '0.24';
      return;
    }

    el.hms.style.transformOrigin = '50% 50%';
    if (ph === 'ZERO') {
      const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
      motion.animations = [
        el.breath.animate([
          { opacity: 0.08 }, { opacity: 0.88, offset: 0.28 }, { opacity: 0.24 }
        ], { duration: 560, easing, fill: 'both' }),
        el.hms.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.012)', opacity: 1, offset: 0.34 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 560, easing, fill: 'both' })
      ];
      return;
    }

    const p = MOTION_PROFILE[ph] || MOTION_PROFILE.NORMAL;
    const linear = 'linear';
    motion.animations = [
      el.breath.animate([
        { opacity: 0.10, offset: 0 },
        { opacity: p.peak, offset: 0.18 },
        { opacity: 0.16, offset: 0.25 },
        { opacity: p.second, offset: 0.34 },
        { opacity: 0.10, offset: 0.46 },
        { opacity: 0.10, offset: 1 }
      ], { duration: p.duration, iterations: Infinity, easing: linear }),
      el.hms.animate([
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(' + p.scale + ')', opacity: 1, offset: 0.18 },
        { transform: 'scale(1)', opacity: p.dip, offset: 0.25 },
        { transform: 'scale(' + (1 + (p.scale - 1) * 0.45) + ')', opacity: 1, offset: 0.34 },
        { transform: 'scale(1)', opacity: 1, offset: 0.46 },
        { transform: 'scale(1)', opacity: 1, offset: 1 }
      ], { duration: p.duration, iterations: Infinity, easing: linear })
    ];
  }

  function setCountdownPhase(phase) {
    const panel = document.querySelector('.clock-panel');
    const ph = String(phase || 'IDLE').toUpperCase();
    if (!panel) { applyMotionPhase(ph); return; }
    panel.classList.remove('clock-armed', 'clock-phase-normal', 'clock-phase-warmup', 'clock-phase-surge', 'clock-phase-pulse', 'clock-phase-zero');
    if (ph !== 'IDLE') panel.classList.add('clock-armed', 'clock-phase-' + ph.toLowerCase());
    applyMotionPhase(ph);
  }

  TC.bus.on('boot', () => {
    el.hms = TC.$('clock-hms');
    // 拆成 HH : MM : SS 三对数字 + 冒号（textContent 仍为 "HH:MM:SS"，测试断言不受影响）
    el.hms.textContent = '';
    for (const k of ['h', 'm', 's']) {
      if (k !== 'h') {
        const c = document.createElement('span');
        c.className = 'd-colon';
        c.textContent = ':';
        el.hms.appendChild(c);
      }
      const s = document.createElement('span');
      s.className = 'd-pair';
      s.textContent = '--';
      el.hms.appendChild(s);
      el.pairs[k] = s;
    }
    el.ms = TC.$('clock-ms');
    el.date = TC.$('clock-date');
    el.ring = document.querySelector('.sec-ring rect');
    el.breath = document.querySelector('.clock-breath');
    motion.media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    motion.reduced = !!(motion.media && motion.media.matches);
    motion.supported = !!(el.breath && el.hms && typeof el.breath.animate === 'function' && typeof el.hms.animate === 'function');
    if (motion.media) {
      const onMotionPreference = () => applyMotionPhase(motion.phase);
      if (motion.media.addEventListener) motion.media.addEventListener('change', onMotionPreference);
      else if (motion.media.addListener) motion.media.addListener(onMotionPreference);
    }
    TC.bus.on('phase', setCountdownPhase);
    TC.bus.on('cd:start', () => setCountdownPhase('NORMAL'));
    TC.bus.on('cd:advance', () => setCountdownPhase('NORMAL'));
    TC.bus.on('cd:stop', () => setCountdownPhase('IDLE'));
    TC.bus.on('cd:done', () => setCountdownPhase('IDLE'));
    TC.bus.on('clockmode', () => applyMotionPhase(motion.phase));
    setCountdownPhase(TC.Countdown.info().phase);
    // 零点脉动：钟面形态下倒计时归零，整窗呼吸一次
    TC.bus.on('cd:zero', () => {
      setCountdownPhase('ZERO');
      if (!document.body.classList.contains('clockmode')) return;
      const panel = document.querySelector('.clock-panel');
      if (!panel) return;
      panel.classList.remove('zero-pulse');
      void panel.offsetWidth;
      panel.classList.add('zero-pulse');
    });
  });
})();
