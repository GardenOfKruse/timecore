/* 主循环：rAF 负责 3D 渲染；时钟/倒计时显示由定时器驱动，
 * 标签页隐藏或窗口最小化（rAF 挂起）时显示与状态依然刷新 */
(function () {
  let pulse = 0, lastSecLeft = -1;

  function logical(e) {
    TC.time.tick();
    TC.Countdown.update(e);
    const info = TC.Countdown.info();
    if (info.armed && !info.fired) {
      const secLeft = Math.ceil(info.remainingMs / 1000);
      if (secLeft !== lastSecLeft) { lastSecLeft = secLeft; pulse = Math.max(pulse, 0.5); }
    } else lastSecLeft = -1;
    TC.Clock.render(e);
    TC.UI.renderCd(info);
    return info;
  }

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;
    const e = TC.time.epoch();
    const info = logical(e);
    const progress = (info.armed || info.fired)
      ? info.progress
      : ((e / 1000) % 60) / 60;            // 待机：秒扫描

    TC.Scene.render(dt, { epoch: e, phase: info.phase, progress, pulse, armed: info.armed });
    pulse *= Math.exp(-dt * 5);
  }

  // 显示刷新（隐藏页会被浏览器钳到 ~1Hz，可见时保持 15Hz 平滑毫秒）
  setInterval(() => logical(TC.time.epoch()), 66);
  // 看门狗：兜底保证到点触发与阶段推进
  setInterval(() => { TC.time.tick(); TC.Countdown.update(TC.time.epoch()); }, 120);

  // 屏幕常亮（装置用途）
  let wakeLock = null;
  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  /* 首次启动判定：tc.welcomed 未写入且没有任何偏好键 → 全新用户；
   * 老版本升级用户（已有偏好）不受打扰。判断实际状态而非版本号 */
  const PREF_KEYS = ['tc.cd', 'tc.vol', 'tc.mute', 'tc.tick', 'tc.softlead', 'tc.track',
    'tc.opacity', 'tc.compact', 'tc.zerofx', 'tc.xparent', 'tc.adb.v1', 'tc.freerun', 'tc.welcomed'];

  function boot() {
    // 悬浮钟窗口（?overlay=1）：只跑时钟，跳过 3D/UI/ADB/节拍器与 rAF 大循环
    if (/[?&]overlay=1/.test(location.search)) {
      document.body.classList.add('overlay');
      TC.bus.emit('boot');   // clock.js 借此抓取时钟元素
      setInterval(() => { TC.time.tick(); TC.Clock.render(TC.time.epoch()); }, 33);
      TC.time.sync();
      if (window.electronAPI) {
        const syncCt = () => window.electronAPI.get().then(st => {
          const b = document.getElementById('ov-ct');
          if (b) { b.textContent = st.overlayCt ? '已穿透' : '穿透'; b.classList.toggle('on', !!st.overlayCt); }
        }).catch(() => {});
        syncCt();
        document.getElementById('ov-ct').addEventListener('click', () => {
          window.electronAPI.get().then(st => { window.electronAPI.send('overlay', { action: 'clickthrough', on: !st.overlayCt }); setTimeout(syncCt, 150); });
        });
        document.getElementById('ov-close').addEventListener('click', () => window.electronAPI.send('overlay', { action: 'hide' }));
      }
      return;
    }
    TC.fresh = !localStorage.getItem('tc.welcomed') && !PREF_KEYS.some(k => localStorage.getItem(k) != null);
    TC.Scene.init(document.getElementById('scene'));
    TC.UI.init();
    // 节拍器开机自启（持久化）；全新用户交给欢迎卡处理——按钮点击顺带完成音频解锁手势
    if (!TC.fresh && localStorage.getItem('tc.freerun') !== '0') TC.Beats.toggleFreerun(true);
    keepAwake();
    requestAnimationFrame(t => { frame.last = t; requestAnimationFrame(frame); });
    TC.time.sync();
    if (window.__tc_install && /[?&]test=1/.test(location.search)) window.__tc_install();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
