/* 自动化测试钩子：仅 ?test=1 时注入 window.__tc */
window.__errs = [];
window.addEventListener('error', e => window.__errs.push({
  msg: e.message, src: (e.filename || '').split('/').pop(), line: e.lineno, col: e.colno,
  stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 400) : null
}));
window.addEventListener('unhandledrejection', e => window.__errs.push({
  rej: String(e.reason && e.reason.stack ? e.reason.stack : e.reason).slice(0, 400)
}));

window.__tc_install = function () {
  const hist = [];
  TC.bus.on('beat:judge', r => hist.push({ k: 'judge', label: r.label, dev: r.dev, combo: r.combo, at: r.at }));
  TC.bus.on('phase', p => hist.push({ k: 'phase', phase: p, t: TC.time.epoch() }));
  TC.bus.on('cd:zero', d => hist.push({ k: 'zero', target: d.target, hasNext: d.hasNext }));
  TC.bus.on('cd:advance', d => hist.push({ k: 'advance', cycleIndex: d.cycleIndex }));
  TC.bus.on('cd:done', () => hist.push({ k: 'done' }));
  TC.bus.on('cd:start', d => hist.push({ k: 'start', target: d.target }));

  window.__tc = {
    epoch: () => TC.time.epoch(),
    start: sec => TC.Countdown.startSingle(TC.time.epoch() + sec * 1000),
    startAligned: (periodSec, cycles, inf) => TC.Countdown.startAligned(periodSec * 1000, cycles, inf),
    startCycles: (durSec, n, inf) => TC.Countdown.startAligned(durSec * 1000, n, inf),
    stop: () => TC.Countdown.stop(),
    beat: dev => TC.Beats.hit(TC.time.epoch(), dev),
    toggleFreerun: () => TC.Beats.toggleFreerun(),
    tz: k => TC.Clock.setTz(k),
    forceOffset: ms => TC.time.setTargetOffset(ms),
    simFail: () => TC.time.simulateFail(),
    resync: () => TC.time.sync(),
    adb: () => window.TC && TC.ADB ? TC.ADB.debug() : null,
    adbArm: node => window.TC && TC.ADB ? TC.ADB.arm(node) : null,
    audio: () => TC.Audio.info(),
    state: () => {
      const b = TC.Beats.stats();
      return Object.assign(TC.Countdown.info(), {
        sync: TC.time.status, offset: TC.time.offset, tz: TC.Clock.tz,
        clockHms: TC.Clock.wallClock(TC.time.epoch()),
        beats: { combo: b.combo, maxCombo: b.maxCombo, total: b.total, counts: b.counts, freerun: b.freerun, last: b.last },
        hist: hist.slice(-40),
        audio: TC.Audio.info(),
        viewport: { w: innerWidth, h: innerHeight, compact: document.body.classList.contains('compact') },
        overflow: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
        errs: window.__errs
      });
    }
  };
  console.log('[timecore] test hooks ready');
};
