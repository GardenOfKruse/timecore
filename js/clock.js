/* 时钟：Intl 时区渲染，毫秒 3 位；每帧更新 */
(function () {
  let tzKey = localStorage.getItem('tc.tz') || 'local';
  const cache = new Map();
  const clockView = globalThis.TimeCoreDomain.createClockView({ document });
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

  TC.Clock = {
    get tz() { return tzKey; },

    setTz(k) {
      try { new Intl.DateTimeFormat('en', { timeZone: k === 'local' ? undefined : k }); }
      catch (_) { k = 'local'; }
      tzKey = k;
      localStorage.setItem('tc.tz', k);
      clockView.resetTime();   // 强制重绘
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
      clockView.render({
        hour: p.hour,
        minute: p.minute,
        second: p.second,
        millisecond: e,
        dateKey: p.year + p.month + p.day,
        dateText: p.year + '-' + p.month + '-' + p.day + ' ' + (WD[p.weekday] || p.weekday)
      });
    },

    // cycle31/诊断用：确认钟面动效确实由 WAAPI 驱动，而不是只存在 CSS 文本。
    debugMotion() { return clockView.debugMotion(); }
  };

  TC.bus.on('boot', () => {
    clockView.mount();
    TC.bus.on('phase', phase => clockView.setPhase(phase));
    TC.bus.on('cd:start', () => clockView.setPhase('NORMAL'));
    TC.bus.on('cd:advance', () => clockView.setPhase('NORMAL'));
    TC.bus.on('cd:stop', () => clockView.setPhase('IDLE'));
    TC.bus.on('cd:done', () => clockView.setPhase('IDLE'));
    TC.bus.on('clockmode', on => clockView.setClockMode(!!on));
    clockView.setPhase(TC.Countdown.info().phase);
    // 零点脉动：钟面形态下倒计时归零，整窗呼吸一次
    TC.bus.on('cd:zero', () => {
      clockView.setPhase('ZERO');
      clockView.zeroPulse();
    });
  });
})();
