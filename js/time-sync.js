/* 网络校时：多源采样 → 计算偏移 → 平滑应用；失败回退本地时钟
 * 时间源：单调时钟 performance.now() + 校准偏移，免疫系统时钟跳变 */
(function () {
  const domain = window.TimeCoreDomain;
  if (!domain) throw new Error('TimeCoreDomain 未加载');
  const perf0 = performance.now();
  const epoch0 = Date.now();
  const clock = domain.createClockModel({ initialEpoch: epoch0, initialMonotonicMs: perf0 });
  const policy = domain.createTimeSyncPolicy();
  const sampler = domain.createTimeSyncSampler({
    now: () => performance.now(),
    baselineEpoch: epoch0,
    baselineMonotonicMs: perf0,
    fetch: (url, init) => fetch(url, init),
    createAbortController: () => new AbortController(),
    setTimeout: (listener, delayMs) => setTimeout(listener, delayMs),
    clearTimeout: handle => clearTimeout(handle)
  });

  const S = {
    status: 'local',      // local | syncing | synced | failed | stale
    lastSync: 0,          // 上次成功校时的 epoch
    lastAttempt: 0,
    sources: []
  };

  TC.time = {
    noSync: new URLSearchParams(location.search).has('nosync'),

    // 单调 + 偏移后的当前时间（epoch ms）
    epoch() {
      return clock.epochAt(performance.now());
    },

    // 平滑推进 offset → targetOffset（rAF 与看门狗都会调用）
    // 用内部实测的真实流逝时间统一限速：回退方向吸收 ≤0.85×真实时间，显示永不倒退；正向追赶最快 8×
    tick() {
      clock.tick(performance.now());
    },

    get status() { return S.status; },
    get offset() { return Math.round(clock.offset); },
    get targetOffset() { return clock.targetOffset; },
    get lastSync() { return S.lastSync; },
    get sources() { return S.sources; },

    setTargetOffset(v) { clock.setTargetOffset(v); },

    // 模拟网络失联：偏移目标归零（平滑回退），状态标记 local
    simulateFail() {
      clock.setTargetOffset(0);
      S.status = 'local';
      TC.bus.emit('sync');
    },

    // 测试用：模拟一次成功的校时结果（叠加在当前时间上）
    simulateSync(offsetMs) {
      clock.setTargetOffset(offsetMs);
      S.status = 'synced';
      S.lastSync = this.epoch();
      TC.bus.emit('sync');
    },

    async sync() {
      if (this.noSync) { S.status = 'local'; clock.setTargetOffset(0); TC.bus.emit('sync'); return false; }
      S.status = 'syncing';
      S.lastAttempt = this.epoch();
      TC.bus.emit('sync');

      const results = await sampler.sampleMany(SOURCES, 3);
      S.sources = results.map(r => ({ name: r.src, rtt: Math.round(r.rtt), offset: Math.round(r.offset) }));

      const nowEpoch = this.epoch();
      const decision = policy.decide(results, nowEpoch, S.lastSync);
      S.status = decision.status;
      if (decision.status === 'synced') {
        clock.setTargetOffset(decision.targetOffset);
        S.lastSync = nowEpoch;
      } else if (decision.targetOffset != null) {
        clock.setTargetOffset(decision.targetOffset); // failed 时平滑回退本地；stale 保留旧偏移
      }
      TC.bus.emit('sync');
      scheduleNext(decision.retryDelayMs);
      return decision.status === 'synced';
    }
  };

  const SOURCES = [
    { name: 'worldtimeapi', url: 'https://worldtimeapi.org/api/timezone/Etc/UTC', parse: j => Date.parse(j.utc_datetime) },
    { name: 'timeapi.io', url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
      parse: j => Date.UTC(j.year, j.month - 1, j.day, j.hour, j.minute, j.seconds, j.milliSeconds) },
    { name: 'taobao', url: 'https://acs.m.taobao.com/gw/mtop.common.getTimestamp/', parse: j => parseInt(j.data.t, 10) }
  ];

  let nextTimer = 0;
  function scheduleNext(delay) {
    clearTimeout(nextTimer);
    nextTimer = setTimeout(() => TC.time.sync(), delay);
  }
})();
