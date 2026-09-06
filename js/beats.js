/* 击拍判定：节拍网格与倒计时绝对节点对齐（target - k*1000ms）
 * 偏差分档：PERFECT ≤60ms / GREAT ≤140ms / GOOD ≤300ms / MISS */
(function () {
  const TIERS = [[60, 'PERFECT'], [140, 'GREAT'], [300, 'GOOD']];
  const COLORS = { PERFECT: '#8ef7ff', GREAT: '#7dff9b', GOOD: '#ffd76a', MISS: '#ff5d7a' };

  const st = {
    combo: 0, maxCombo: 0, total: 0,
    counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
    freerun: false, last: null, history: []
  };

  // 当前可用节拍网格：倒计时优先，其次自由节拍器（对齐整秒绝对节点）
  function grid(e) {
    const cd = TC.Countdown.info();
    if (cd.armed && !cd.fired) {
      return { node: cd.target - Math.round((cd.target - e) / 1000) * 1000, mode: 'cd' };
    }
    if (st.freerun) return { node: Math.round(e / 1000) * 1000, mode: 'free' };
    return null;
  }

  function labelFor(devMs) {
    const a = Math.abs(devMs);
    for (const [t, l] of TIERS) if (a <= t) return l;
    return 'MISS';
  }

  function hit(e, forcedDev) {
    const g = grid(e);
    if (!g) { TC.bus.emit('beat:none'); return null; }
    const dev = forcedDev != null ? forcedDev : (e - g.node);
    const label = labelFor(dev);
    st.total++;
    st.counts[label]++;
    if (label === 'MISS') st.combo = 0;
    else { st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo); }
    const acc = st.total ? (st.counts.PERFECT + st.counts.GREAT) / st.total : 0;
    const rec = { label, color: COLORS[label], dev: Math.round(dev), combo: st.combo, maxCombo: st.maxCombo, acc, mode: g.mode, at: e };
    st.last = rec;
    st.history.push(rec);
    if (st.history.length > 50) st.history.shift();
    TC.bus.emit('beat:judge', rec);
    return rec;
  }

  function toggleFreerun(force) {
    st.freerun = force != null ? force : !st.freerun;
    localStorage.setItem('tc.freerun', st.freerun ? '1' : '0');
    TC.bus.emit('freerun', st.freerun);
    return st.freerun;
  }

  function stats() {
    return { combo: st.combo, maxCombo: st.maxCombo, total: st.total, counts: Object.assign({}, st.counts), freerun: st.freerun, last: st.last };
  }

  TC.Beats = { hit, stats, toggleFreerun, labelFor, COLORS };
})();
