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
    }
  };

  const el = { pairs: {} };
  const last = { h: '', m: '', s: '', day: '' };

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
    // 零点脉动：钟面形态下倒计时归零，整窗呼吸一次
    TC.bus.on('cd:zero', () => {
      if (!document.body.classList.contains('clockmode')) return;
      const panel = document.querySelector('.clock-panel');
      if (!panel) return;
      panel.classList.remove('zero-pulse');
      void panel.offsetWidth;
      panel.classList.add('zero-pulse');
    });
  });
})();
