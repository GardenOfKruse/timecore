/* 兼容桥接：Domain CountdownEngine 负责纯时间状态机；此处只注入 epoch 并转发旧 bus Interface。 */
(function () {
  const domain = window.TimeCoreDomain;
  if (!domain) throw new Error('TimeCoreDomain 未加载');
  const engine = domain.createCountdownEngine();
  const PHASE_LABEL = { IDLE: '待机', NORMAL: '运行', WARMUP: '外环预热', SURGE: '能量增强', PULSE: '强脉冲', ZERO: '释放' };

  function info() {
    const s = engine.snapshot();
    return Object.assign({}, s, { phaseLabel: PHASE_LABEL[s.phase] });
  }

  function publish(events) {
    for (const event of events) {
      if (event.type === 'start') TC.bus.emit('cd:start', info());
      else if (event.type === 'stop') TC.bus.emit('cd:stop');
      else if (event.type === 'phase') TC.bus.emit('phase', event.phase);
      else if (event.type === 'zero') TC.bus.emit('cd:zero', event);
      else if (event.type === 'advance') TC.bus.emit('cd:advance', { cycleIndex: event.cycleIndex });
      else if (event.type === 'done') TC.bus.emit('cd:done');
    }
  }

  function startSingle(absEpoch) {
    const now = TC.time.epoch();
    const events = engine.startSingle(absEpoch, now);
    publish(events);
    return events.length > 0;
  }

  function startAligned(periodMs, cycles, infinite) {
    const events = engine.startAligned(periodMs, cycles, infinite, TC.time.epoch());
    publish(events);
    return events.length > 0;
  }

  function startCycles({ durMs, cycles, infinite }) {
    return startAligned(durMs, cycles, infinite);
  }

  function stop() { publish(engine.stop()); }
  function update(epoch) { publish(engine.update(epoch)); }

  function fmtRemaining(ms) {
    ms = Math.max(0, ms);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    const f = Math.floor(ms % 1000);
    return (h > 0 ? TC.pad(h, 2) + ':' : '') + TC.pad(m, 2) + ':' + TC.pad(s, 2) + '.' + TC.pad(f, 3);
  }

  TC.Countdown = { startSingle, startAligned, startCycles, stop, update, info, fmtRemaining, nextAlignedNode: domain.nextAlignedNode };
})();
