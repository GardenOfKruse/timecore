/* 击拍判定：节拍网格与倒计时绝对节点对齐（target - k*1000ms）
 * 偏差分档：PERFECT ≤60ms / GREAT ≤140ms / GOOD ≤300ms / MISS */
(function () {
  const beatJudge = globalThis.TimeCoreDomain.createBeatJudge();
  const beatStats = globalThis.TimeCoreDomain.createBeatStats();
  try { beatStats.load(JSON.parse(localStorage.getItem('tc.beatstats.v1') || 'null')); } catch (_) {}
  const st = { freerun: false };

  function dateKey(e) {
    const d = new Date(e);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  let statsSaveTimer = 0;
  function scheduleStatsSave() {
    clearTimeout(statsSaveTimer);
    statsSaveTimer = setTimeout(() => { try { localStorage.setItem('tc.beatstats.v1', beatStats.serialize()); } catch (_) {} }, 800);
  }
  function renderStats() {
    const box = document.getElementById('beat-stats');
    if (!box) return;
    const sum = beatStats.summary(dateKey(Date.now()));
    if (!sum.today) { box.textContent = '今日击拍 0 · 连击 0 · 准确率 —%'; box.title = '每日击拍统计（本地保存 30 天）'; return; }
    box.textContent = '今日击拍 ' + sum.today.count + ' · 最高连击 ' + sum.today.maxCombo + ' · 准确率 ' + sum.today.accuracy + '%';
    const keys = Object.keys(sum.days).sort().slice(-7);
    box.title = '每日击拍统计（本地保存 30 天）\n近 7 日：' + keys.map(k => k.slice(5) + ' ' + sum.days[k].count + ' 发').join('，');
  }

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
    beatStats.record(dateKey(e), rec);   // 每日击拍统计（本地 30 天）
    scheduleStatsSave();
    renderStats();
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

  TC.Beats = { hit, stats, toggleFreerun, labelFor: beatJudge.labelFor, COLORS: beatJudge.colors, debugStats: () => beatStats.summary(dateKey(Date.now())) };
  renderStats();
})();
