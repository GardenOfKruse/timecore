/* 主循环：rAF 负责 3D 渲染；时钟/倒计时显示由定时器驱动，
 * 标签页隐藏或窗口最小化（rAF 挂起）时显示与状态依然刷新 */
(function () {
  function logical(e) {
    TC.time.tick();
    TC.Countdown.update(e);
    const info = TC.Countdown.info();
    TC.Clock.render(e);
    TC.UI.renderCd(info);
    return info;
  }

  const runtimeLoop = TimeCoreDomain.createRuntimeLoop({
    now: () => performance.now(),
    epoch: () => TC.time.epoch(),
    requestFrame: listener => requestAnimationFrame(listener),
    cancelFrame: handle => cancelAnimationFrame(handle),
    setInterval: (listener, delayMs) => setInterval(listener, delayMs),
    clearInterval: handle => clearInterval(handle)
  }, {
    logical,
    watchdog: () => { TC.time.tick(); TC.Countdown.update(TC.time.epoch()); },
    renderScene: (dt, frame) => TC.Scene.render(dt, frame)
  });

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
    TC.fresh = !localStorage.getItem('tc.welcomed') && !PREF_KEYS.some(k => localStorage.getItem(k) != null);
    TC.Scene.init(document.getElementById('scene'));
    TC.UI.init();
    // 节拍器开机自启（持久化）；全新用户交给欢迎卡处理——按钮点击顺带完成音频解锁手势
    if (!TC.fresh && localStorage.getItem('tc.freerun') !== '0') TC.Beats.toggleFreerun(true);
    keepAwake();
    runtimeLoop.start();
    TC.time.sync();
    if (window.__tc_install && /[?&]test=1/.test(location.search)) window.__tc_install();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
