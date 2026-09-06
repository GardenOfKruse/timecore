/* 倒计时：按绝对时间节点（epoch ms）计算，支持多周期连跑
 * 阶段：>10s 运行 → 10s 外环预热 → 5s 能量增强 → 3s 强节奏脉冲 → 0 释放 */
(function () {
  const C = {
    armed: false, mode: 'single',      // single | cycles
    target: 0, startEpoch: 0, totalMs: 1,
    durMs: 0, cycles: 1, cycleIndex: 0, infinite: false,
    aligned: false, periodMs: 0,       // 对齐模式：节点 = 本地零点起每 periodMs 一个整节点
    phase: 'IDLE', fired: false, hasNext: false, holdUntil: 0,
    lastTarget: 0, rem: 0, progress: 0
  };
  const HOLD_MS = 2600;                 // 释放反馈驻留时长

  // 下一个对齐节点：本地当日 00:00:00.000 起按 periodMs 划分的边界（5分→09:05:00.000、09:10:00.000…）
  function nextAlignedNode(periodMs, e) {
    const d = new Date(e);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const passed = e - midnight;
    return midnight + (Math.floor(passed / periodMs) + 1) * periodMs;
  }

  const PHASE_LABEL = { IDLE: '待机', NORMAL: '运行', WARMUP: '外环预热', SURGE: '能量增强', PULSE: '强脉冲', ZERO: '释放' };

  function phaseFor(remMs) {
    if (remMs > 10000) return 'NORMAL';
    if (remMs > 5000) return 'WARMUP';
    if (remMs > 3000) return 'SURGE';
    return 'PULSE';
  }

  function startSingle(absEpoch) {
    if (!isFinite(absEpoch) || absEpoch <= TC.time.epoch()) return false;
    Object.assign(C, {
      armed: true, mode: 'single', target: absEpoch, lastTarget: absEpoch,
      startEpoch: TC.time.epoch(), totalMs: Math.max(1, absEpoch - TC.time.epoch()),
      cycles: 1, cycleIndex: 1, infinite: false, phase: 'NORMAL',
      aligned: false, periodMs: 0,
      fired: false, hasNext: false, holdUntil: 0
    });
    TC.bus.emit('cd:start', info());
    return true;
  }

  // 对齐模式：周期 periodMs 的整节点序列（5分 → 每个整 5 分时刻），背靠背连跑
  function startAligned(periodMs, cycles, infinite) {
    if (!isFinite(periodMs) || periodMs < 1000) return false;
    const first = nextAlignedNode(periodMs, TC.time.epoch());
    Object.assign(C, {
      armed: true, mode: (infinite || (cycles | 0) > 1) ? 'cycles' : 'single',
      target: first, lastTarget: first,
      startEpoch: TC.time.epoch(), totalMs: periodMs, durMs: periodMs, periodMs,
      cycles: Math.max(1, cycles | 0), cycleIndex: 1, infinite: !!infinite,
      aligned: true, phase: 'NORMAL',
      fired: false, hasNext: !!infinite || (cycles | 0) > 1, holdUntil: 0
    });
    TC.bus.emit('cd:start', info());
    return true;
  }

  // 兼容旧接口
  function startCycles({ durMs, cycles, infinite }) {
    return startAligned(durMs, cycles, infinite);
  }

  function stop() {
    const was = C.armed;
    C.armed = false; C.fired = false; C.phase = 'IDLE'; C.rem = 0; C.progress = 0;
    if (was) TC.bus.emit('cd:stop');
    TC.bus.emit('phase', 'IDLE');
  }

  function fire(e) {
    C.fired = true;
    C.phase = 'ZERO';
    C.lastTarget = C.target;
    C.holdUntil = e + HOLD_MS;
    C.hasNext = C.mode === 'cycles' && (C.infinite || C.cycleIndex < C.cycles);
    C.rem = 0; C.progress = 1;
    TC.bus.emit('cd:zero', { target: C.target, hasNext: C.hasNext, cycleIndex: C.cycleIndex });
  }

  function advance(e) {
    C.cycleIndex++;
    C.target += C.durMs;                // 绝对节点推进，不受处理延迟影响
    C.startEpoch = e;
    C.totalMs = C.durMs;
    C.fired = false;
    C.phase = 'NORMAL';
    C.hasNext = C.infinite || C.cycleIndex < C.cycles;
    TC.bus.emit('cd:advance', { cycleIndex: C.cycleIndex });
  }

  // 主循环与看门狗都会调用（后台标签页隐藏时靠看门狗保证到点触发）
  function update(e) {
    if (!C.armed) {
      if (C.phase !== 'IDLE') { C.phase = 'IDLE'; TC.bus.emit('phase', 'IDLE'); }
      return;
    }
    if (C.fired) {
      if (e >= C.holdUntil) {
        if (C.hasNext) advance(e);
        else {
          C.armed = false; C.phase = 'IDLE'; C.progress = 0;
          TC.bus.emit('cd:done');
          TC.bus.emit('phase', 'IDLE');
        }
      }
      return;
    }
    const r = C.target - e;
    if (r <= 0) { fire(e); return; }
    C.rem = r;
    C.progress = TC.clamp(1 - r / C.totalMs, 0, 1);
    const ph = phaseFor(r);
    if (ph !== C.phase) { C.phase = ph; TC.bus.emit('phase', ph); }
  }

  function info() {
    return {
      armed: C.armed, mode: C.mode, phase: C.phase, phaseLabel: PHASE_LABEL[C.phase],
      target: C.target, lastTarget: C.lastTarget, remainingMs: C.armed && !C.fired ? C.rem : 0,
      progress: C.armed ? C.progress : 0,
      cycleIndex: C.cycleIndex, cycles: C.cycles, infinite: C.infinite,
      aligned: C.aligned, periodMs: C.periodMs,
      fired: C.fired, hasNext: C.hasNext, totalMs: C.totalMs, startEpoch: C.startEpoch
    };
  }

  function fmtRemaining(ms) {
    ms = Math.max(0, ms);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    const f = Math.floor(ms % 1000);
    return (h > 0 ? TC.pad(h, 2) + ':' : '') + TC.pad(m, 2) + ':' + TC.pad(s, 2) + '.' + TC.pad(f, 3);
  }

  TC.Countdown = { startSingle, startAligned, startCycles, stop, update, info, fmtRemaining, nextAlignedNode };
})();
