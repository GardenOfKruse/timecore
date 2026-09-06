/* 网络校时：多源采样 → 计算偏移 → 平滑应用；失败回退本地时钟
 * 时间源：单调时钟 performance.now() + 校准偏移，免疫系统时钟跳变 */
(function () {
  const perf0 = performance.now();
  const epoch0 = Date.now();

  const S = {
    status: 'local',      // local | syncing | synced | failed | stale
    offset: 0,            // 当前平滑生效的偏移 ms
    targetOffset: 0,      // 目标偏移 ms
    lastSync: 0,          // 上次成功校时的 epoch
    lastAttempt: 0,
    sources: []
  };

  TC.time = {
    noSync: new URLSearchParams(location.search).has('nosync'),

    // 单调 + 偏移后的当前时间（epoch ms）
    epoch() {
      return epoch0 + (performance.now() - perf0) + S.offset;
    },

    // 平滑推进 offset → targetOffset（rAF 与看门狗都会调用）
    // 用内部实测的真实流逝时间统一限速：回退方向吸收 ≤0.85×真实时间，显示永不倒退；正向追赶最快 8×
    tick() {
      const nowMs = performance.now();
      const real = Math.min(1000, nowMs - (S._lastTickMs || nowMs));
      S._lastTickMs = nowMs;
      if (real <= 0) return;
      const d = S.targetOffset - S.offset;
      if (Math.abs(d) < 0.5) { S.offset = S.targetOffset; return; }
      const k = (1 - Math.exp(-real / 420)) * Math.abs(d);   // ~0.42s 时间常数
      S.offset += d > 0 ? Math.min(k, real * 8) : Math.max(-k, -real * 0.85);
    },

    get status() { return S.status; },
    get offset() { return Math.round(S.offset); },
    get targetOffset() { return S.targetOffset; },
    get lastSync() { return S.lastSync; },
    get sources() { return S.sources; },

    setTargetOffset(v) { S.targetOffset = v; },

    // 模拟网络失联：偏移目标归零（平滑回退），状态标记 local
    simulateFail() {
      S.targetOffset = 0;
      S.status = 'local';
      TC.bus.emit('sync');
    },

    // 测试用：模拟一次成功的校时结果（叠加在当前时间上）
    simulateSync(offsetMs) {
      S.targetOffset = offsetMs;
      S.status = 'synced';
      S.lastSync = this.epoch();
      TC.bus.emit('sync');
    },

    async sync() {
      if (this.noSync) { S.status = 'local'; S.targetOffset = 0; TC.bus.emit('sync'); return false; }
      S.status = 'syncing';
      S.lastAttempt = this.epoch();
      TC.bus.emit('sync');

      const results = [];
      for (const src of SOURCES) {
        try {
          const r = await sampleOne(src);
          results.push(r);
          if (results.length >= 3) break;
        } catch (_) { /* 源失败则尝试下一个 */ }
      }
      S.sources = results.map(r => ({ name: r.src, rtt: Math.round(r.rtt), offset: Math.round(r.offset) }));

      let chosen = null;
      if (results.length >= 2) {
        results.sort((a, b) => a.rtt - b.rtt);
        chosen = results[0];
        // 两源偏差过大且都高延迟 → 不可信
        if (Math.abs(results[0].offset - results[1].offset) > 400 && results[0].rtt > 400) chosen = null;
      } else if (results.length === 1 && results[0].rtt < 350) {
        chosen = results[0];
      }

      if (chosen) {
        S.targetOffset = Math.round(chosen.offset);
        S.status = 'synced';
        S.lastSync = this.epoch();
      } else if (S.lastSync && this.epoch() - S.lastSync < 30 * 60000) {
        S.status = 'stale';               // 保留旧偏移，30 分钟后自动回退
      } else {
        S.status = 'failed';
        S.targetOffset = 0;               // 平滑回退本地
      }
      TC.bus.emit('sync');
      scheduleNext(S.status === 'synced' ? 5 * 60000 : 60 * 1000);
      return !!chosen;
    }
  };

  const SOURCES = [
    { name: 'worldtimeapi', url: 'https://worldtimeapi.org/api/timezone/Etc/UTC', parse: j => Date.parse(j.utc_datetime) },
    { name: 'timeapi.io', url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
      parse: j => Date.UTC(j.year, j.month - 1, j.day, j.hour, j.minute, j.seconds, j.milliSeconds) },
    { name: 'taobao', url: 'https://acs.m.taobao.com/gw/mtop.common.getTimestamp/', parse: j => parseInt(j.data.t, 10) }
  ];

  async function sampleOne(src) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2500);
    const t0 = performance.now();
    try {
      const res = await fetch(src.url, { cache: 'no-store', signal: ctl.signal });
      const t1 = performance.now();               // 响应头到达时刻
      const server = src.parse(JSON.parse(await res.text()));
      if (!isFinite(server)) throw new Error('bad payload');
      const rtt = t1 - t0;                        // 只计网络耗时，排除本地解析
      if (rtt > 1800) throw new Error('rtt too high');
      // 服务器时间戳生成于 [t0, t1] 区间，对称假设取中点
      const localMid = epoch0 + ((t0 + t1) / 2 - perf0);
      return { offset: server - localMid, rtt, src: src.name };
    } finally { clearTimeout(to); }
  }

  let nextTimer = 0;
  function scheduleNext(delay) {
    clearTimeout(nextTimer);
    nextTimer = setTimeout(() => TC.time.sync(), delay);
  }
})();
