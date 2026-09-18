/* 击拍判定：节拍网格与倒计时绝对节点对齐（target - k*1000ms）
 * 偏差分档：PERFECT ≤60ms / GREAT ≤140ms / GOOD ≤300ms / MISS */
(function () {
  const beatJudge = globalThis.TimeCoreDomain.createBeatJudge();
  const st = { freerun: false };

  // 当前可用节拍网格：倒计时优先，其次自由节拍器（对齐整秒绝对节点）
  function grid(e) {
    const cd = TC.Countdown.info();
    if (cd.armed && !cd.fired) {
      return { node: cd.target - Math.round((cd.target - e) / 1000) * 1000, mode: 'cd' };
    }
    if (st.freerun) return { node: Math.round(e / 1000) * 1000, mode: 'free' };
    return null;
  }

  function hit(e, forcedDev) {
    const g = grid(e);
    if (!g) { TC.bus.emit('beat:none'); return null; }
    const rec = beatJudge.judge({ at: e, nodeEpoch: g.node, mode: g.mode, forcedDeviation: forcedDev });
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
    return Object.assign(beatJudge.stats(), { freerun: st.freerun });
  }

  TC.Beats = { hit, stats, toggleFreerun, labelFor: beatJudge.labelFor, COLORS: beatJudge.colors };
})();
